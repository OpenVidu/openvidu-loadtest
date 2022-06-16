import sys
import getopt

debug = False
remux = False
viewer = "viewer.yuv"
prefix = "qoe_"
fragment_duration_secs = 5
padding_duration_secs = 1
width = 640
height = 480
fps = 30
presenter = "presenter.yuv"
presenter_audio = "presenter.wav"

try:
    optlist, args = getopt.getopt(sys.argv[1:], '', [
                                'debug', 'viewer=', 'prefix=', 'fragment_duration_secs=', 'padding_duration_secs=', 'width=', 'height=', 'fps=', 'presenter=', 'presenter_audio=', 'remux'])
    for o, a in optlist:
        if o == '--debug':
            debug = True
        if o == '--viewer':
            viewer = a
        if o == '--prefix':
            prefix = a
        if o == '--fragment_duration_secs':
            fragment_duration_secs = int(a)
        if o == '--padding_duration_secs':
            padding_duration_secs = int(a)
        if o == '--width':
            width = int(a)
        if o == '--height':
            height = int(a)
        if o == '--fps':
            fps = int(a)
        if o == '--remux':
            remux = True
        if o == '--presenter':
            presenter = a
        if o == '--presenter_audio':
            presenter_audio = a
except getopt.GetoptError as err:
    # just use defaults
    pass
