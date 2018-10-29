ffmpeg -i input.mp4 -vf "drawtext='fontsize=40:fontcolor=white@0.8:box=1:boxcolor=black@0.75:fontfile=Roboto-Regular.ttf:text=%{pts\:gmtime\:0\:%M\\\\\:%S}:y=h-th'" -s 540x360 -r 30 -pix_fmt yuv420p -y fakevideo.mp4 && \
ffmpeg -i fakevideo.mp4 -vf "drawtext='fontsize=40:fontcolor=white@0.8:box=1:boxcolor=black@0.75:fontfile=Roboto-Regular.ttf:text=%{n}'" -y fakevideo2.mp4 && \
ffmpeg -i fakevideo2.mp4 -pix_fmt yuv420p fakevideo.y4m && \
sed -i '0,/C420mpeg2/s//C420/' *.y4m && \
ffmpeg -i fakevideo2.mp4 fakeaudio.wav && \
rm fake*.mp4
