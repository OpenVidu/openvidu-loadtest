#!/usr/bin/env Rscript
args = commandArgs(trailingOnly=TRUE)
resultPath = args[1];

library(readr)
library(ggplot2)

subscriberData <- read_csv(paste(resultPath, "/loadTestSubscriberResultsAverage.csv", sep=''))
publisherData <- read_csv(paste(resultPath, "/loadTestPublisherResultsAverage.csv", sep=''))

savePng <- function(filename, drawnPlot){
	ggsave(paste(filename, ".png", sep=''), plot = drawnPlot, device = "png", path = resultPath, scale = 1, width = 7, height = 4, units = "in", dpi = 300, limitsize = TRUE)
}

# Subscriber RTT
scaleFactor = max(subscriberData$rtt) / max(subscriberData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.11, 0.91)
plot = ggplot(subscriberData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=rtt, colour="RTT"), size=1.1) + ylab("RTT (milliseconds)") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("subscriberRTT", plot)

# Subscriber Bitrate
scaleFactor = max(subscriberData$bitrate) / max(subscriberData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.87, 0.15)
plot = ggplot(subscriberData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=bitrate, colour="Bitrate"), size=1.1) + ylab("Bitrate (kbps)") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("subscriberBITRATE", plot)

# Subscriber Jitter
scaleFactor = max(subscriberData$jitter) / max(subscriberData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.87, 0.15)
plot = ggplot(subscriberData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=jitter, colour="Jitter"), size=1.1) + ylab("Jitter") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("subscriberJITTER", plot)

# Subscriber Delay
scaleFactor = max(subscriberData$delay) / max(subscriberData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.11, 0.91)
plot = ggplot(subscriberData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=delay, colour="Delay"), size=1.1) + ylab("Delay (milliseconds") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("subscriberDELAY", plot)

# Subscriber FramesDecoded
scaleFactor = max(subscriberData$framesDecoded) / max(subscriberData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.11, 0.91)
plot = ggplot(subscriberData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=framesDecoded, colour="FramesDecoded"), size=1.1) + ylab("FramesDecoded") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("subscriberFRAMESDECODED", plot)

# Subscriber PacketsLost
scaleFactor = max(subscriberData$packetsLost) / max(subscriberData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.11, 0.91)
plot = ggplot(subscriberData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=packetsLost, colour="PacketsLost"), size=1.1) + ylab("PacketsLost") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("subscriberPACKETSLOST", plot)

# CPU usage
scaleFactor = max(subscriberData$cpu) / max(subscriberData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.11, 0.91)
plot = ggplot(subscriberData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=cpu, colour="CPU"), size=1.1) + ylab("CPU usage (%)") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("cpuUsage", plot)

# MEM usage
scaleFactor = max(subscriberData$cpu) / max(subscriberData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.11, 0.91)
plot = ggplot(subscriberData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=mem, colour="Memory"), size=1.1) + ylab("Memory usage (%)") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("memoryUsage", plot)

# Publisher RTT
scaleFactor = max(publisherData$rtt) / max(publisherData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.11, 0.91)
plot = ggplot(publisherData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=rtt, colour="RTT"), size=1.1) + ylab("RTT (milliseconds)") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("publisherRTT", plot)

# Publisher Bitrate
scaleFactor = max(publisherData$bitrate) / max(publisherData$browsers)
if (scaleFactor == 0) {
	scaleFactor = 1;
}
legendPosition = c(0.87, 0.15)
plot = ggplot(publisherData, aes(x=time)) + xlab("Time (seconds)") + geom_line(aes(y=bitrate, colour="Bitrate"), size=1.1) + ylab("Bitrate (kbps)") + geom_line(aes(y=browsers*scaleFactor, colour="Participants"), size=1.1) + scale_y_continuous(sec.axis = sec_axis(~./scaleFactor, name = "Number of participants")) + theme(legend.position = legendPosition)
savePng("publisherBITRATE", plot)
