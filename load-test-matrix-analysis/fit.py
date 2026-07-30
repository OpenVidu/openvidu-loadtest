#!/usr/bin/env python3
"""Fit the media-node cost model and report how much to trust each coefficient.

The model being fitted is the additive form from the measurement plan:

    cores_sfu = C_idle
              + k_room · rooms
              + k_part · participants
              + k_sub  · tracks_subscribed
              + g_in   · packets_in
              + g_out  · packets_out

Several candidate forms are fitted rather than one, because the terms are
partly collinear and which of them is identifiable depends entirely on which
design points exist. Two lessons are built in:

  * Coefficients are constrained non-negative (a negative cost per stream is not
    a physical result, it is a sign the term is unidentified). A term that wants
    to go negative is dropped and the form refitted, which is reported.

  * R-squared alone is worthless here. A form fitted on points that all share
    one bitrate reaches R2 = 0.998 and then fails by 15% on the first point at a
    different bitrate. So every fit also reports max residual, leave-one-out
    coefficient spread, and -- when a holdout is given -- out-of-sample error.

    fit.py rows.json
    fit.py rows.json --form tracks_sub,pkts_in,pkts_out
    fit.py rows.json --holdout s7a,s7b        # fit without these, then predict them
    fit.py rows.json --target egress_cores    # fit the recording term instead

Only the standard library is used; the solver is normal equations with partial
pivoting, which is fine for the handful of terms and dozens of points involved.
"""

from __future__ import annotations

import argparse
import json
import sys

# Candidate model forms, in increasing order of ambition. Named so the output can
# be discussed without repeating the term list.
FORMS = [
    ("per forwarded track only", ["tracks_sub"]),
    ("inbound + outbound tracks", ["tracks_pub", "tracks_sub"]),
    ("per outbound packet only", ["pkts_out"]),
    ("tracks + outbound packets", ["tracks_sub", "pkts_out"]),
    ("inbound + outbound packets", ["pkts_in", "pkts_out"]),
    ("tracks + both packet directions", ["tracks_sub", "pkts_in", "pkts_out"]),
    ("rooms + tracks + both directions", ["rooms", "tracks_sub", "pkts_in", "pkts_out"]),
    ("participants + tracks + both directions",
     ["participants", "tracks_sub", "pkts_in", "pkts_out"]),
]


def solve(matrix, target):
    """Least squares by normal equations with partial pivoting. None if singular."""
    n = len(matrix[0])
    aug = [[sum(matrix[k][i] * matrix[k][j] for k in range(len(matrix)))
            for j in range(n)] + [sum(matrix[k][i] * target[k]
                                      for k in range(len(matrix)))]
           for i in range(n)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(aug[r][col]))
        if abs(aug[pivot][col]) < 1e-12:
            return None
        aug[col], aug[pivot] = aug[pivot], aug[col]
        for r in range(n):
            if r != col:
                factor = aug[r][col] / aug[col][col]
                for k in range(col, n + 1):
                    aug[r][k] -= factor * aug[col][k]
    return [aug[i][n] / aug[i][i] for i in range(n)]


def fit(rows, terms, target_key):
    """Non-negative least squares by dropping the most negative term and refitting."""
    active, dropped = list(terms), []
    while True:
        design = [[1.0] + [float(r.get(t) or 0.0) for t in active] for r in rows]
        target = [float(r[target_key]) for r in rows]
        beta = solve(design, target)
        if beta is None:
            return None
        negative = [i for i, b in enumerate(beta[1:]) if b < 0]
        if not negative:
            break
        worst = min(negative, key=lambda i: beta[i + 1])
        dropped.append(active.pop(worst))
        if not active:
            return None

    predicted = [sum(b * x for b, x in zip(beta, row)) for row in design]
    residuals = [p - t for p, t in zip(predicted, target)]
    mean = sum(target) / len(target)
    ss_tot = sum((t - mean) ** 2 for t in target)
    ss_res = sum(r * r for r in residuals)
    return {
        "coef": dict(zip(["intercept"] + active, beta)),
        "terms": active,
        "dropped": dropped,
        "r2": 1 - ss_res / ss_tot if ss_tot else float("nan"),
        "max_residual": max(abs(r) for r in residuals),
        "rms_residual": (ss_res / len(residuals)) ** 0.5,
        "n": len(rows),
    }


def leave_one_out(rows, terms, target_key):
    """{term: (min, max, spread_pct)} across every fit with one point removed.

    A coefficient that swings wildly when one point is dropped is being carried by
    that point. Note the converse is not guaranteed: a term can be unstable here
    and still reproduce well on an independent dataset, so treat this as a warning
    flag rather than a verdict.
    """
    if len(rows) < 4:
        return {}
    collected = {}
    for i in range(len(rows)):
        got = fit(rows[:i] + rows[i + 1:], terms, target_key)
        if got:
            for k, v in got["coef"].items():
                collected.setdefault(k, []).append(v)
    out = {}
    for k, values in collected.items():
        mean = sum(values) / len(values)
        spread = (max(values) - min(values)) / abs(mean) * 100 if mean else float("nan")
        out[k] = (min(values), max(values), spread)
    return out


def predict(coef, row):
    total = coef.get("intercept", 0.0)
    for term, value in coef.items():
        if term != "intercept":
            total += value * float(row.get(term) or 0.0)
    return total


def report(label, result, loo, holdout, target_key):
    if not result:
        print(f"\n{label}: could not be fitted (singular or all terms negative)")
        return
    print(f"\n{label}   (n={result['n']}, R2={result['r2']:.4f})")
    for term, value in result["coef"].items():
        suffix = ""
        if loo and term in loo:
            lo, hi, spread = loo[term]
            suffix = f"   leave-one-out {lo:+.3e}..{hi:+.3e} ({spread:.0f}% spread)"
        unit = " cores" if term == "intercept" else " per unit"
        print(f"   {term:16} {value:+.5e}{unit}{suffix}")
    if result["dropped"]:
        print(f"   dropped as negative: {', '.join(result['dropped'])} "
              "(not identifiable from these points)")
    print(f"   residual: max {result['max_residual']:.3f}, "
          f"rms {result['rms_residual']:.3f} cores")
    if result["coef"].get("intercept", 0.0) < 0:
        # Only the slope terms are constrained non-negative; a negative intercept
        # is left visible because it is diagnostic. An idle deployment cannot cost
        # negative CPU, so this means the form is absorbing something it should
        # not -- usually a mix of points too heterogeneous to share one intercept.
        print("   !! negative intercept: unphysical, so this form is misspecified for")
        print("      these points. Split the set (e.g. exclude runs with a recording")
        print("      active, or runs whose rooms were truncated) or add a term.")

    if holdout:
        print("   out-of-sample:")
        for row in holdout:
            measured = float(row[target_key])
            got = predict(result["coef"], row)
            err = (got - measured) / measured * 100 if measured else float("nan")
            print(f"     {row['point']:12} measured {measured:7.3f}  "
                  f"predicted {got:7.3f}  {err:+6.1f}%")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rows", help="rows.json from extract.py")
    ap.add_argument("--target", default="sfu_cores",
                    help="column to explain (default sfu_cores; try egress_cores)")
    ap.add_argument("--form", help="comma-separated terms; fits only this form")
    ap.add_argument("--holdout", default="",
                    help="comma-separated points excluded from the fit and predicted")
    ap.add_argument("--exclude", default="",
                    help="comma-separated points dropped entirely (invalid runs)")
    args = ap.parse_args()

    with open(args.rows) as fh:
        everything = json.load(fh)

    excluded = {p for p in args.exclude.split(",") if p}
    held = {p for p in args.holdout.split(",") if p}
    usable = [r for r in everything
              if r.get(args.target) is not None and r["point"] not in excluded]
    holdout = [r for r in usable if r["point"] in held]
    rows = [r for r in usable if r["point"] not in held]

    if len(rows) < 3:
        print(f"only {len(rows)} usable points; need at least 3 to fit anything",
              file=sys.stderr)
        return 1

    print("=" * 78)
    print(f"MEDIA-NODE COST MODEL  --  explaining {args.target}")
    print("=" * 78)
    print(f"{len(rows)} points fitted"
          + (f", {len(holdout)} held out: {', '.join(sorted(held))}" if holdout else "")
          + (f"; excluded: {', '.join(sorted(excluded))}" if excluded else ""))

    forms = [("requested form", [t.strip() for t in args.form.split(",")])] \
        if args.form else FORMS
    for label, terms in forms:
        available = [t for t in terms if any(r.get(t) is not None for r in rows)]
        if len(available) < len(terms):
            print(f"\n{label}: skipped, missing columns "
                  f"{', '.join(set(terms) - set(available))}")
            continue
        result = fit(rows, available, args.target)
        loo = leave_one_out(rows, available, args.target) if result else {}
        report(label, result, loo, holdout, args.target)

    print()
    print("Reading this output:")
    print("  * Compare forms on max residual and out-of-sample error, not on R2.")
    print("  * A term reported as dropped is not zero-cost -- it is unmeasurable")
    print("    from these points. Add a design point that varies it alone.")
    print("  * A large leave-one-out spread means one point is carrying the term.")
    print("  * The intercept is the idle cost. Measure it directly with idle.py")
    print("    instead of trusting the fitted value: a set of points that never")
    print("    goes near idle will inflate it, and the model then overcharges the")
    print("    small deployments a pricing calculator is most often asked about.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
