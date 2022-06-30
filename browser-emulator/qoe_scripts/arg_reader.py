import argparse

parser = argparse.ArgumentParser(description="QoE analyzer")
parser.add_argument("--debug", action="store_true", default=False, help="Enable debug mode")
parser.add_argument("--remux", action="store_true", default=False, help="Enable remux mode")
parser.add_argument("--viewer", type=str, default="viewer.yuv", help="Distorted viewer video")
parser.add_argument("--prefix", type=str, default="qoe_", help="Prefix for output files")
parser.add_argument("--fragment-duration-secs", type=int, default=5, help="Fragment duration in seconds")
parser.add_argument("--padding-duration-secs", type=int, default=1, help="Padding duration in seconds")
parser.add_argument("--width", type=int, default=640, help="Width of the video")
parser.add_argument("--height", type=int, default=480, help="Height of the video")
parser.add_argument("--fps", type=int, default=30, help="FPS of the video")
parser.add_argument("--presenter", type=str, default="presenter.yuv", help="Original video")
parser.add_argument("--presenter-audio", type=str, default="presenter.wav", help="Original audio")
parser.add_argument("--max-cpus", type=int, help="Max number of CPUs to use")

args = parser.parse_args()
debug = args.debug
fps = args.fps
fragment_duration_secs = args.fragment_duration_secs
padding_duration_secs = args.padding_duration_secs
width = args.width
height = args.height
presenter = args.presenter
presenter_audio = args.presenter_audio
remux = args.remux
viewer = args.viewer
prefix = args.prefix
max_cpus = args.max_cpus