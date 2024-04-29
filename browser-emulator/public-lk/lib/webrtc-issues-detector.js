(function (exports) {
  'use strict';

  var domain;// This constructor is used to store event handlers. Instantiating this is
  // faster than explicitly calling `Object.create(null)` to get a "clean" empty
  // object (tested with v8 v4.9).
  function EventHandlers(){}EventHandlers.prototype=Object.create(null);function EventEmitter(){EventEmitter.init.call(this);}// require('events') === require('events').EventEmitter
  EventEmitter.EventEmitter=EventEmitter,EventEmitter.usingDomains=!1,EventEmitter.prototype.domain=void 0,EventEmitter.prototype._events=void 0,EventEmitter.prototype._maxListeners=void 0,EventEmitter.defaultMaxListeners=10,EventEmitter.init=function(){this.domain=null,EventEmitter.usingDomains&&domain.active&&!(this instanceof domain.Domain)&&(this.domain=domain.active),this._events&&this._events!==Object.getPrototypeOf(this)._events||(this._events=new EventHandlers,this._eventsCount=0),this._maxListeners=this._maxListeners||void 0;},EventEmitter.prototype.setMaxListeners=function(a){if("number"!=typeof a||0>a||isNaN(a))throw new TypeError("\"n\" argument must be a positive number");return this._maxListeners=a,this};function $getMaxListeners(a){return void 0===a._maxListeners?EventEmitter.defaultMaxListeners:a._maxListeners}EventEmitter.prototype.getMaxListeners=function(){return $getMaxListeners(this)};// These standalone emit* functions are used to optimize calling of event
  // handlers for fast cases because emit() itself often has a variable number of
  // arguments and can be deoptimized because of that. These functions always have
  // the same number of arguments and thus do not get deoptimized, so the code
  // inside them can execute faster.
  function emitNone(a,b,c){if(b)a.call(c);else for(var d=a.length,e=arrayClone(a,d),f=0;f<d;++f)e[f].call(c);}function emitOne(a,b,c,d){if(b)a.call(c,d);else for(var e=a.length,f=arrayClone(a,e),g=0;g<e;++g)f[g].call(c,d);}function emitTwo(a,b,c,d,e){if(b)a.call(c,d,e);else for(var f=a.length,g=arrayClone(a,f),h=0;h<f;++h)g[h].call(c,d,e);}function emitThree(a,b,c,d,e,f){if(b)a.call(c,d,e,f);else for(var g=a.length,h=arrayClone(a,g),j=0;j<g;++j)h[j].call(c,d,e,f);}function emitMany(a,b,c,d){if(b)a.apply(c,d);else for(var e=a.length,f=arrayClone(a,e),g=0;g<e;++g)f[g].apply(c,d);}EventEmitter.prototype.emit=function(a){var b,c,d,e,f,g,h,j="error"===a;if(g=this._events,g)j=j&&null==g.error;else if(!j)return !1;// If there is no 'error' event listener then throw.
  if(h=this.domain,j){if(b=arguments[1],h)b||(b=new Error("Uncaught, unspecified \"error\" event")),b.domainEmitter=this,b.domain=h,b.domainThrown=!1,h.emit("error",b);else if(b instanceof Error)throw b;// Unhandled 'error' event
  else {// At least give some kind of context to the user
  var k=new Error("Uncaught, unspecified \"error\" event. ("+b+")");throw k.context=b,k}return !1}if(c=g[a],!c)return !1;var l="function"==typeof c;switch(d=arguments.length,d){// fast cases
  case 1:emitNone(c,l,this);break;case 2:emitOne(c,l,this,arguments[1]);break;case 3:emitTwo(c,l,this,arguments[1],arguments[2]);break;case 4:emitThree(c,l,this,arguments[1],arguments[2],arguments[3]);break;// slower
  default:for(e=Array(d-1),f=1;f<d;f++)e[f-1]=arguments[f];emitMany(c,l,this,e);}return !0};function _addListener(a,b,c,d){var e,f,g;if("function"!=typeof c)throw new TypeError("\"listener\" argument must be a function");if(f=a._events,f?(f.newListener&&(a.emit("newListener",b,c.listener?c.listener:c),f=a._events),g=f[b]):(f=a._events=new EventHandlers,a._eventsCount=0),!g)g=f[b]=c,++a._eventsCount;else// Check for listener leak
  if("function"==typeof g?g=f[b]=d?[c,g]:[g,c]:d?g.unshift(c):g.push(c),!g.warned&&(e=$getMaxListeners(a),e&&0<e&&g.length>e)){g.warned=!0;var h=new Error("Possible EventEmitter memory leak detected. "+g.length+" "+b+" listeners added. Use emitter.setMaxListeners() to increase limit");h.name="MaxListenersExceededWarning",h.emitter=a,h.type=b,h.count=g.length,emitWarning(h);}return a}function emitWarning(a){"function"==typeof console.warn?console.warn(a):console.log(a);}EventEmitter.prototype.addListener=function(a,b){return _addListener(this,a,b,!1)},EventEmitter.prototype.on=EventEmitter.prototype.addListener,EventEmitter.prototype.prependListener=function(a,b){return _addListener(this,a,b,!0)};function _onceWrap(a,b,c){function d(){a.removeListener(b,d),e||(e=!0,c.apply(a,arguments));}var e=!1;return d.listener=c,d}EventEmitter.prototype.once=function(a,b){if("function"!=typeof b)throw new TypeError("\"listener\" argument must be a function");return this.on(a,_onceWrap(this,a,b)),this},EventEmitter.prototype.prependOnceListener=function(a,b){if("function"!=typeof b)throw new TypeError("\"listener\" argument must be a function");return this.prependListener(a,_onceWrap(this,a,b)),this},EventEmitter.prototype.removeListener=function(a,b){var c,d,e,f,g;if("function"!=typeof b)throw new TypeError("\"listener\" argument must be a function");if(d=this._events,!d)return this;if(c=d[a],!c)return this;if(c===b||c.listener&&c.listener===b)0==--this._eventsCount?this._events=new EventHandlers:(delete d[a],d.removeListener&&this.emit("removeListener",a,c.listener||b));else if("function"!=typeof c){for(e=-1,f=c.length;0<f--;)if(c[f]===b||c[f].listener&&c[f].listener===b){g=c[f].listener,e=f;break}if(0>e)return this;if(1===c.length){if(c[0]=void 0,0==--this._eventsCount)return this._events=new EventHandlers,this;delete d[a];}else spliceOne(c,e);d.removeListener&&this.emit("removeListener",a,g||b);}return this},EventEmitter.prototype.removeAllListeners=function(a){var b,c;if(c=this._events,!c)return this;// not listening for removeListener, no need to emit
  if(!c.removeListener)return 0===arguments.length?(this._events=new EventHandlers,this._eventsCount=0):c[a]&&(0==--this._eventsCount?this._events=new EventHandlers:delete c[a]),this;// emit removeListener for all listeners on all events
  if(0===arguments.length){for(var d,e=Object.keys(c),f=0;f<e.length;++f)d=e[f],"removeListener"!==d&&this.removeAllListeners(d);return this.removeAllListeners("removeListener"),this._events=new EventHandlers,this._eventsCount=0,this}if(b=c[a],"function"==typeof b)this.removeListener(a,b);else if(b)// LIFO order
  do this.removeListener(a,b[b.length-1]);while(b[0]);return this},EventEmitter.prototype.listeners=function(a){var b,c,d=this._events;return d?(b=d[a],c=b?"function"==typeof b?[b.listener||b]:unwrapListeners(b):[]):c=[],c},EventEmitter.listenerCount=function(a,b){return "function"==typeof a.listenerCount?a.listenerCount(b):listenerCount.call(a,b)},EventEmitter.prototype.listenerCount=listenerCount;function listenerCount(a){var b=this._events;if(b){var c=b[a];if("function"==typeof c)return 1;if(c)return c.length}return 0}EventEmitter.prototype.eventNames=function(){return 0<this._eventsCount?Reflect.ownKeys(this._events):[]};// About 1.5x faster than the two-arg version of Array#splice().
  function spliceOne(a,b){for(var c=b,d=c+1,e=a.length;d<e;c+=1,d+=1)a[c]=a[d];a.pop();}function arrayClone(a,b){for(var c=Array(b);b--;)c[b]=a[b];return c}function unwrapListeners(a){for(var b=Array(a.length),c=0;c<b.length;++c)b[c]=a[c].listener||a[c];return b}

  class WebRTCIssueEmitter extends EventEmitter {
  }

  exports.EventType = void 0;
  (function (EventType) {
      EventType["Issue"] = "issue";
      EventType["NetworkScoresUpdated"] = "network-scores-updated";
      EventType["StatsParsingFinished"] = "stats-parsing-finished";
  })(exports.EventType || (exports.EventType = {}));
  exports.IssueType = void 0;
  (function (IssueType) {
      IssueType["Network"] = "network";
      IssueType["CPU"] = "cpu";
      IssueType["Server"] = "server";
      IssueType["Stream"] = "stream";
  })(exports.IssueType || (exports.IssueType = {}));
  exports.IssueReason = void 0;
  (function (IssueReason) {
      IssueReason["OutboundNetworkQuality"] = "outbound-network-quality";
      IssueReason["InboundNetworkQuality"] = "inbound-network-quality";
      IssueReason["OutboundNetworkMediaLatency"] = "outbound-network-media-latency";
      IssueReason["InboundNetworkMediaLatency"] = "inbound-network-media-latency";
      IssueReason["NetworkMediaSyncFailure"] = "network-media-sync-failure";
      IssueReason["OutboundNetworkThroughput"] = "outbound-network-throughput";
      IssueReason["InboundNetworkThroughput"] = "inbound-network-throughput";
      IssueReason["EncoderCPUThrottling"] = "encoder-cpu-throttling";
      IssueReason["DecoderCPUThrottling"] = "decoder-cpu-throttling";
      IssueReason["ServerIssue"] = "server-issue";
      IssueReason["UnknownVideoDecoderIssue"] = "unknown-video-decoder";
      IssueReason["LowInboundMOS"] = "low-inbound-mean-opinion-score";
      IssueReason["LowOutboundMOS"] = "low-outbound-mean-opinion-score";
  })(exports.IssueReason || (exports.IssueReason = {}));

  class PeriodicWebRTCStatsReporter extends EventEmitter {
      static STATS_REPORT_READY_EVENT = 'stats-report-ready';
      static STATS_REPORTS_PARSED = 'stats-reports-parsed';
      isStopped = false;
      reportTimer;
      getStatsInterval;
      compositeStatsParser;
      constructor(params) {
          super();
          this.compositeStatsParser = params.compositeStatsParser;
          this.getStatsInterval = params.getStatsInterval ?? 10_000;
      }
      get isRunning() {
          return !!this.reportTimer && !this.isStopped;
      }
      startReporting() {
          if (this.reportTimer) {
              return;
          }
          const doExtract = () => setTimeout(() => {
              if (this.isStopped) {
                  this.reportTimer = undefined;
                  return;
              }
              this.parseReports()
                  .finally(() => {
                  this.reportTimer = doExtract();
              });
          }, this.getStatsInterval);
          this.isStopped = false;
          this.reportTimer = doExtract();
      }
      stopReporting() {
          this.isStopped = true;
          if (this.reportTimer) {
              clearTimeout(this.reportTimer);
              this.reportTimer = undefined;
          }
      }
      async parseReports() {
          const startTime = Date.now();
          const reportItems = await this.compositeStatsParser.parse();
          const timeTaken = Date.now() - startTime;
          this.emit(PeriodicWebRTCStatsReporter.STATS_REPORTS_PARSED, { timeTaken });
          reportItems.forEach((item) => {
              this.emit(PeriodicWebRTCStatsReporter.STATS_REPORT_READY_EVENT, item);
          });
      }
  }

  const createTaskScheduler = () => {
      const scheduledTasks = new Map();
      return (payload) => {
          const { taskId, delayMs, maxJitterMs, callback, } = payload;
          const jitter = Math.ceil(Math.random() * (maxJitterMs || 0));
          const timer = scheduledTasks.get(taskId);
          if (timer) {
              clearTimeout(timer);
          }
          const newTimer = setTimeout(() => {
              callback();
              scheduledTasks.delete(taskId);
          }, delayMs + jitter);
          scheduledTasks.set(taskId, newTimer);
      };
  };
  const scheduleTask = createTaskScheduler();

  // eslint-disable-next-line import/prefer-default-export
  const CLEANUP_PREV_STATS_TTL_MS = 35_000;

  class NetworkScoresCalculator {
      #lastProcessedStats = {};
      calculate(data) {
          const { connection: { id: connectionId } } = data;
          const { mos: outbound, stats: outboundStatsSample } = this.calculateOutboundScore(data) || {};
          const { mos: inbound, stats: inboundStatsSample } = this.calculateInboundScore(data) || {};
          this.#lastProcessedStats[connectionId] = data;
          scheduleTask({
              taskId: connectionId,
              delayMs: CLEANUP_PREV_STATS_TTL_MS,
              callback: () => (delete this.#lastProcessedStats[connectionId]),
          });
          return {
              outbound,
              inbound,
              statsSamples: {
                  inboundStatsSample,
                  outboundStatsSample,
              },
          };
      }
      calculateOutboundScore(data) {
          const remoteInboundRTPStreamsStats = [
              ...data.remote?.audio.inbound || [],
              ...data.remote?.video.inbound || [],
          ];
          if (!remoteInboundRTPStreamsStats.length) {
              return undefined;
          }
          const previousStats = this.#lastProcessedStats[data.connection.id];
          if (!previousStats) {
              return undefined;
          }
          const previousRemoteInboundRTPStreamsStats = [
              ...previousStats.remote?.audio.inbound || [],
              ...previousStats.remote?.video.inbound || [],
          ];
          const { packetsSent } = data.connection;
          const lastPacketsSent = previousStats.connection.packetsSent;
          const rtpNetworkStats = remoteInboundRTPStreamsStats.reduce((stats, currentStreamStats) => {
              const previousStreamStats = previousRemoteInboundRTPStreamsStats
                  .find((stream) => stream.ssrc === currentStreamStats.ssrc);
              return {
                  sumJitter: stats.sumJitter + currentStreamStats.jitter,
                  packetsLost: stats.packetsLost + currentStreamStats.packetsLost,
                  lastPacketsLost: stats.lastPacketsLost + (previousStreamStats?.packetsLost || 0),
              };
          }, {
              sumJitter: 0,
              packetsLost: 0,
              lastPacketsLost: 0,
          });
          const rtt = (1e3 * data.connection.currentRoundTripTime) || 0;
          const { sumJitter } = rtpNetworkStats;
          const avgJitter = sumJitter / remoteInboundRTPStreamsStats.length;
          const deltaPacketSent = packetsSent - lastPacketsSent;
          const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;
          const packetsLoss = deltaPacketSent && deltaPacketLost
              ? Math.round((deltaPacketLost * 100) / (deltaPacketSent + deltaPacketLost))
              : 0;
          const mos = this.calculateMOS({ avgJitter, rtt, packetsLoss });
          return {
              mos,
              stats: { avgJitter, rtt, packetsLoss },
          };
      }
      calculateInboundScore(data) {
          const inboundRTPStreamsStats = [...data.audio?.inbound, ...data.video?.inbound];
          if (!inboundRTPStreamsStats.length) {
              return undefined;
          }
          const previousStats = this.#lastProcessedStats[data.connection.id];
          if (!previousStats) {
              return undefined;
          }
          const previousInboundStreamStats = [...previousStats.video?.inbound, ...previousStats.audio?.inbound];
          const { packetsReceived } = data.connection;
          const lastPacketsReceived = previousStats.connection.packetsReceived;
          const rtpNetworkStats = inboundRTPStreamsStats.reduce((stats, currentStreamStats) => {
              const previousStreamStats = previousInboundStreamStats.find((stream) => stream.ssrc === currentStreamStats.ssrc);
              return {
                  sumJitter: stats.sumJitter + currentStreamStats.jitter,
                  packetsLost: stats.packetsLost + currentStreamStats.packetsLost,
                  lastPacketsLost: stats.lastPacketsLost + (previousStreamStats?.packetsLost || 0),
              };
          }, {
              sumJitter: 0,
              packetsLost: 0,
              lastPacketsLost: 0,
          });
          const rtt = (1e3 * data.connection.currentRoundTripTime) || 0;
          const { sumJitter } = rtpNetworkStats;
          const avgJitter = sumJitter / inboundRTPStreamsStats.length;
          const deltaPacketReceived = packetsReceived - lastPacketsReceived;
          const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;
          const packetsLoss = deltaPacketReceived && deltaPacketLost
              ? Math.round((deltaPacketLost * 100) / (deltaPacketReceived + deltaPacketLost))
              : 0;
          const mos = this.calculateMOS({ avgJitter, rtt, packetsLoss });
          return {
              mos,
              stats: { avgJitter, rtt, packetsLoss },
          };
      }
      calculateMOS({ avgJitter, rtt, packetsLoss }) {
          const effectiveLatency = rtt + (avgJitter * 2) + 10;
          let rFactor = effectiveLatency < 160
              ? 93.2 - (effectiveLatency / 40)
              : 93.2 - (effectiveLatency / 120) - 10;
          rFactor -= (packetsLoss * 2.5);
          return 1 + (0.035) * rFactor + (0.000007) * rFactor * (rFactor - 60) * (100 - rFactor);
      }
  }

  class BaseIssueDetector {
      #lastProcessedStats;
      #statsCleanupDelayMs;
      constructor(params = {}) {
          this.#lastProcessedStats = new Map();
          this.#statsCleanupDelayMs = params.statsCleanupTtlMs ?? CLEANUP_PREV_STATS_TTL_MS;
      }
      detect(data) {
          const result = this.performDetection(data);
          this.performPrevStatsCleanup({
              connectionId: data.connection.id,
          });
          return result;
      }
      performPrevStatsCleanup(payload) {
          const { connectionId, cleanupCallback } = payload;
          if (!this.#lastProcessedStats.has(connectionId)) {
              return;
          }
          scheduleTask({
              taskId: connectionId,
              delayMs: this.#statsCleanupDelayMs,
              callback: () => {
                  this.deleteLastProcessedStats(connectionId);
                  if (typeof cleanupCallback === 'function') {
                      cleanupCallback();
                  }
              },
          });
      }
      setLastProcessedStats(connectionId, parsedStats) {
          this.#lastProcessedStats.set(connectionId, parsedStats);
      }
      getLastProcessedStats(connectionId) {
          return this.#lastProcessedStats.get(connectionId);
      }
      deleteLastProcessedStats(connectionId) {
          this.#lastProcessedStats.delete(connectionId);
      }
  }

  class AvailableOutgoingBitrateIssueDetector extends BaseIssueDetector {
      #availableOutgoingBitrateThreshold;
      constructor(params = {}) {
          super(params);
          this.#availableOutgoingBitrateThreshold = params.availableOutgoingBitrateThreshold ?? 100_000; // 100 KBit/s
      }
      performDetection(data) {
          const issues = [];
          const { availableOutgoingBitrate } = data.connection;
          if (availableOutgoingBitrate === undefined) {
              // availableOutgoingBitrate is not measured yet
              return issues;
          }
          const audioStreamsTotalTargetBitrate = data.audio.outbound
              .reduce((totalBitrate, streamStat) => totalBitrate + streamStat.targetBitrate, 0);
          const videoStreamsTotalBitrate = data.video.outbound
              .reduce((totalBitrate, streamStat) => totalBitrate + streamStat.bitrate, 0);
          if (!audioStreamsTotalTargetBitrate && !videoStreamsTotalBitrate) {
              // there are no streams sending through this connection
              return issues;
          }
          const statsSample = {
              availableOutgoingBitrate,
              videoStreamsTotalBitrate,
              audioStreamsTotalTargetBitrate,
          };
          if (audioStreamsTotalTargetBitrate > availableOutgoingBitrate) {
              issues.push({
                  statsSample,
                  type: exports.IssueType.Network,
                  reason: exports.IssueReason.OutboundNetworkThroughput,
              });
              return issues;
          }
          if (videoStreamsTotalBitrate > 0 && availableOutgoingBitrate < this.#availableOutgoingBitrateThreshold) {
              issues.push({
                  statsSample,
                  type: exports.IssueType.Network,
                  reason: exports.IssueReason.OutboundNetworkThroughput,
              });
              return issues;
          }
          return issues;
      }
  }

  class FramesDroppedIssueDetector extends BaseIssueDetector {
      #framesDroppedThreshold;
      constructor(params = {}) {
          super(params);
          this.#framesDroppedThreshold = params.framesDroppedThreshold ?? 0.5;
      }
      performDetection(data) {
          const { connection: { id: connectionId } } = data;
          const issues = this.processData(data);
          this.setLastProcessedStats(connectionId, data);
          return issues;
      }
      processData(data) {
          const streamsWithDroppedFrames = data.video.inbound.filter((stats) => stats.framesDropped > 0);
          const issues = [];
          const previousInboundRTPVideoStreamsStats = this.getLastProcessedStats(data.connection.id)?.video.inbound;
          if (!previousInboundRTPVideoStreamsStats) {
              return issues;
          }
          streamsWithDroppedFrames.forEach((streamStats) => {
              const previousStreamStats = previousInboundRTPVideoStreamsStats.find((item) => item.ssrc === streamStats.ssrc);
              if (!previousStreamStats) {
                  return;
              }
              if (streamStats.framesDropped === previousStreamStats.framesDropped) {
                  // stream is decoded correctly
                  return;
              }
              const deltaFramesReceived = streamStats.framesReceived - previousStreamStats.framesReceived;
              const deltaFramesDecoded = streamStats.framesDecoded - previousStreamStats.framesDecoded;
              const deltaFramesDropped = streamStats.framesDropped - previousStreamStats.framesDropped;
              const framesDropped = deltaFramesDropped / deltaFramesReceived;
              if (deltaFramesReceived === 0 || deltaFramesDecoded === 0) {
                  // looks like stream is stopped, skip checking framesDropped
                  return;
              }
              const statsSample = {
                  deltaFramesDropped,
                  deltaFramesReceived,
                  deltaFramesDecoded,
                  framesDroppedPct: Math.round(framesDropped * 100),
              };
              if (framesDropped >= this.#framesDroppedThreshold) {
                  // more than half of the received frames were dropped
                  issues.push({
                      statsSample,
                      type: exports.IssueType.CPU,
                      reason: exports.IssueReason.DecoderCPUThrottling,
                      ssrc: streamStats.ssrc,
                  });
              }
          });
          return issues;
      }
  }

  class FramesEncodedSentIssueDetector extends BaseIssueDetector {
      #missedFramesThreshold;
      constructor(params = {}) {
          super(params);
          this.#missedFramesThreshold = params.missedFramesThreshold ?? 0.15;
      }
      performDetection(data) {
          const { connection: { id: connectionId } } = data;
          const issues = this.processData(data);
          this.setLastProcessedStats(connectionId, data);
          return issues;
      }
      processData(data) {
          const streamsWithEncodedFrames = data.video.outbound.filter((stats) => stats.framesEncoded > 0);
          const issues = [];
          const previousOutboundRTPVideoStreamsStats = this.getLastProcessedStats(data.connection.id)?.video.outbound;
          if (!previousOutboundRTPVideoStreamsStats) {
              return issues;
          }
          streamsWithEncodedFrames.forEach((streamStats) => {
              const previousStreamStats = previousOutboundRTPVideoStreamsStats.find((item) => item.ssrc === streamStats.ssrc);
              if (!previousStreamStats) {
                  return;
              }
              if (streamStats.framesEncoded === previousStreamStats.framesEncoded) {
                  // stream is paused
                  return;
              }
              const deltaFramesEncoded = streamStats.framesEncoded - previousStreamStats.framesEncoded;
              const deltaFramesSent = streamStats.framesSent - previousStreamStats.framesSent;
              const missedFrames = 1 - deltaFramesSent / deltaFramesEncoded;
              if (deltaFramesEncoded === 0) {
                  // stream is paused
                  return;
              }
              if (deltaFramesEncoded === deltaFramesSent) {
                  // stream is ok
                  return;
              }
              const statsSample = {
                  deltaFramesSent,
                  deltaFramesEncoded,
                  missedFramesPct: Math.round(missedFrames * 100),
              };
              if (missedFrames >= this.#missedFramesThreshold) {
                  issues.push({
                      statsSample,
                      type: exports.IssueType.Network,
                      reason: exports.IssueReason.OutboundNetworkThroughput,
                      ssrc: streamStats.ssrc,
                  });
              }
          });
          return issues;
      }
  }

  class InboundNetworkIssueDetector extends BaseIssueDetector {
      highPacketLossThresholdPct;
      highJitterThreshold;
      highJitterBufferDelayThresholdMs;
      highRttThresholdMs;
      constructor(params = {}) {
          super();
          this.highPacketLossThresholdPct = params.highPacketLossThresholdPct ?? 5;
          this.highJitterThreshold = params.highJitterThreshold ?? 200;
          this.highJitterBufferDelayThresholdMs = params.highJitterBufferDelayThresholdMs ?? 500;
          this.highRttThresholdMs = params.highRttThresholdMs ?? 250;
      }
      performDetection(data) {
          const { connection: { id: connectionId } } = data;
          const issues = this.processData(data);
          this.setLastProcessedStats(connectionId, data);
          return issues;
      }
      processData(data) {
          const issues = [];
          const inboundRTPStreamsStats = [...data.audio?.inbound, ...data.video?.inbound];
          if (!inboundRTPStreamsStats.length) {
              return issues;
          }
          const previousStats = this.getLastProcessedStats(data.connection.id);
          if (!previousStats) {
              return issues;
          }
          const previousInboundStreamStats = [...previousStats.video?.inbound, ...previousStats.audio?.inbound];
          const { packetsReceived } = data.connection;
          const lastPacketsReceived = previousStats.connection.packetsReceived;
          const rtpNetworkStats = inboundRTPStreamsStats.reduce((stats, currentStreamStats) => {
              const previousStreamStats = previousInboundStreamStats.find((stream) => stream.ssrc === currentStreamStats.ssrc);
              const lastJitterBufferDelay = previousStreamStats?.jitterBufferDelay || 0;
              const lastJitterBufferEmittedCount = previousStreamStats?.jitterBufferEmittedCount || 0;
              const delay = currentStreamStats.jitterBufferDelay - lastJitterBufferDelay;
              const emitted = currentStreamStats.jitterBufferEmittedCount - lastJitterBufferEmittedCount;
              const jitterBufferDelayMs = delay && emitted ? (1e3 * delay) / emitted : 0;
              return {
                  sumJitter: stats.sumJitter + currentStreamStats.jitter,
                  sumJitterBufferDelayMs: stats.sumJitterBufferDelayMs + jitterBufferDelayMs,
                  packetsLost: stats.packetsLost + currentStreamStats.packetsLost,
                  lastPacketsLost: stats.lastPacketsLost + (previousStreamStats?.packetsLost || 0),
              };
          }, {
              sumJitter: 0,
              sumJitterBufferDelayMs: 0,
              packetsLost: 0,
              lastPacketsLost: 0,
          });
          const rtt = (1e3 * data.connection.currentRoundTripTime) || 0;
          const { sumJitter, sumJitterBufferDelayMs } = rtpNetworkStats;
          const avgJitter = sumJitter / inboundRTPStreamsStats.length;
          const avgJitterBufferDelay = sumJitterBufferDelayMs / inboundRTPStreamsStats.length;
          const deltaPacketReceived = packetsReceived - lastPacketsReceived;
          const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;
          const packetLossPct = deltaPacketReceived && deltaPacketLost
              ? Math.round((deltaPacketLost * 100) / (deltaPacketReceived + deltaPacketLost))
              : 0;
          const isHighPacketsLoss = packetLossPct > this.highPacketLossThresholdPct;
          const isHighJitter = avgJitter >= this.highJitterThreshold;
          const isHighRTT = rtt >= this.highRttThresholdMs;
          const isHighJitterBufferDelay = avgJitterBufferDelay > this.highJitterBufferDelayThresholdMs;
          const isNetworkIssue = isHighJitter || isHighPacketsLoss;
          const isServerIssue = isHighRTT && !isHighJitter && !isHighPacketsLoss;
          const isNetworkMediaLatencyIssue = isHighPacketsLoss && isHighJitter;
          const isNetworkMediaSyncIssue = isHighJitter && isHighJitterBufferDelay;
          const statsSample = {
              rtt,
              packetLossPct,
              avgJitter,
              avgJitterBufferDelay,
          };
          if (isNetworkIssue) {
              issues.push({
                  statsSample,
                  type: exports.IssueType.Network,
                  reason: exports.IssueReason.InboundNetworkQuality,
                  iceCandidate: data.connection.local.id,
              });
          }
          if (isServerIssue) {
              issues.push({
                  statsSample,
                  type: exports.IssueType.Server,
                  reason: exports.IssueReason.ServerIssue,
                  iceCandidate: data.connection.remote.id,
              });
          }
          if (isNetworkMediaLatencyIssue) {
              issues.push({
                  statsSample,
                  type: exports.IssueType.Network,
                  reason: exports.IssueReason.InboundNetworkMediaLatency,
                  iceCandidate: data.connection.local.id,
              });
          }
          if (isNetworkMediaSyncIssue) {
              issues.push({
                  statsSample,
                  type: exports.IssueType.Network,
                  reason: exports.IssueReason.NetworkMediaSyncFailure,
                  iceCandidate: data.connection.local.id,
              });
          }
          return issues;
      }
  }

  class NetworkMediaSyncIssueDetector extends BaseIssueDetector {
      performDetection(data) {
          const { connection: { id: connectionId } } = data;
          const issues = this.processData(data);
          this.setLastProcessedStats(connectionId, data);
          return issues;
      }
      processData(data) {
          const inboundRTPAudioStreamsStats = data.audio.inbound;
          const issues = [];
          const previousInboundRTPAudioStreamsStats = this.getLastProcessedStats(data.connection.id)?.audio.inbound;
          if (!previousInboundRTPAudioStreamsStats) {
              return issues;
          }
          inboundRTPAudioStreamsStats.forEach((stats) => {
              const previousStreamStats = previousInboundRTPAudioStreamsStats.find((item) => item.ssrc === stats.ssrc);
              if (!previousStreamStats) {
                  return;
              }
              const nowCorrectedSamples = stats.track.insertedSamplesForDeceleration
                  + stats.track.removedSamplesForAcceleration;
              const lastCorrectedSamples = previousStreamStats.track.insertedSamplesForDeceleration
                  + previousStreamStats.track.removedSamplesForAcceleration;
              if (nowCorrectedSamples === lastCorrectedSamples) {
                  return;
              }
              const deltaSamplesReceived = stats.track.totalSamplesReceived - previousStreamStats.track.totalSamplesReceived;
              const deltaCorrectedSamples = nowCorrectedSamples - lastCorrectedSamples;
              const correctedSamplesPct = Math.round((deltaCorrectedSamples * 100) / deltaSamplesReceived);
              const statsSample = {
                  correctedSamplesPct,
              };
              if (correctedSamplesPct > 5) {
                  issues.push({
                      statsSample,
                      type: exports.IssueType.Network,
                      reason: exports.IssueReason.NetworkMediaSyncFailure,
                      ssrc: stats.ssrc,
                  });
              }
          });
          return issues;
      }
  }

  class OutboundNetworkIssueDetector extends BaseIssueDetector {
      performDetection(data) {
          const { connection: { id: connectionId } } = data;
          const issues = this.processData(data);
          this.setLastProcessedStats(connectionId, data);
          return issues;
      }
      processData(data) {
          const issues = [];
          const remoteInboundRTPStreamsStats = [
              ...data.remote?.audio.inbound || [],
              ...data.remote?.video.inbound || [],
          ];
          if (!remoteInboundRTPStreamsStats.length) {
              return issues;
          }
          const previousStats = this.getLastProcessedStats(data.connection.id);
          if (!previousStats) {
              return issues;
          }
          const previousRemoteInboundRTPStreamsStats = [
              ...previousStats.remote?.audio.inbound || [],
              ...previousStats.remote?.video.inbound || [],
          ];
          const { packetsSent } = data.connection;
          const lastPacketsSent = previousStats.connection.packetsSent;
          const rtpNetworkStats = remoteInboundRTPStreamsStats.reduce((stats, currentStreamStats) => {
              const previousStreamStats = previousRemoteInboundRTPStreamsStats
                  .find((stream) => stream.ssrc === currentStreamStats.ssrc);
              return {
                  sumJitter: stats.sumJitter + currentStreamStats.jitter,
                  packetsLost: stats.packetsLost + currentStreamStats.packetsLost,
                  lastPacketsLost: stats.lastPacketsLost + (previousStreamStats?.packetsLost || 0),
              };
          }, {
              sumJitter: 0,
              packetsLost: 0,
              lastPacketsLost: 0,
          });
          const rtt = (1e3 * data.connection.currentRoundTripTime) || 0;
          const { sumJitter } = rtpNetworkStats;
          const avgJitter = sumJitter / remoteInboundRTPStreamsStats.length;
          const deltaPacketSent = packetsSent - lastPacketsSent;
          const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;
          const packetLossPct = deltaPacketSent && deltaPacketLost
              ? Math.round((deltaPacketLost * 100) / (deltaPacketSent + deltaPacketLost))
              : 0;
          const isHighPacketsLoss = packetLossPct > 5;
          const isHighJitter = avgJitter >= 200;
          const isNetworkMediaLatencyIssue = isHighPacketsLoss && isHighJitter;
          const isNetworkIssue = (!isHighPacketsLoss && isHighJitter) || isHighJitter || isHighPacketsLoss;
          const statsSample = {
              rtt,
              avgJitter,
              packetLossPct,
          };
          if (isNetworkMediaLatencyIssue) {
              issues.push({
                  statsSample,
                  type: exports.IssueType.Network,
                  reason: exports.IssueReason.OutboundNetworkMediaLatency,
                  iceCandidate: data.connection.local.id,
              });
          }
          if (isNetworkIssue) {
              issues.push({
                  statsSample,
                  type: exports.IssueType.Network,
                  reason: exports.IssueReason.OutboundNetworkQuality,
                  iceCandidate: data.connection.local.id,
              });
          }
          return issues;
      }
  }

  class QualityLimitationsIssueDetector extends BaseIssueDetector {
      performDetection(data) {
          const { connection: { id: connectionId } } = data;
          const issues = this.processData(data);
          this.setLastProcessedStats(connectionId, data);
          return issues;
      }
      processData(data) {
          const streamsWithLimitation = data.video.outbound.filter((stats) => stats.qualityLimitationReason !== 'none');
          const issues = [];
          const previousOutboundRTPVideoStreamsStats = this.getLastProcessedStats(data.connection.id)?.video.outbound;
          if (!previousOutboundRTPVideoStreamsStats) {
              return issues;
          }
          streamsWithLimitation.forEach((streamStats) => {
              const previousStreamStats = previousOutboundRTPVideoStreamsStats.find((item) => item.ssrc === streamStats.ssrc);
              if (!previousStreamStats) {
                  // can not determine current status of the stream
                  return;
              }
              const statsSample = {
                  qualityLimitationReason: streamStats.qualityLimitationReason,
              };
              if (streamStats.framesSent > previousStreamStats.framesSent) {
                  // stream is still sending
                  return;
              }
              if (streamStats.qualityLimitationReason === 'cpu') {
                  issues.push({
                      statsSample,
                      type: exports.IssueType.CPU,
                      reason: exports.IssueReason.EncoderCPUThrottling,
                      ssrc: streamStats.ssrc,
                  });
              }
              if (streamStats.qualityLimitationReason === 'bandwidth') {
                  issues.push({
                      statsSample,
                      type: exports.IssueType.Network,
                      reason: exports.IssueReason.OutboundNetworkThroughput,
                      ssrc: streamStats.ssrc,
                  });
              }
          });
          return issues;
      }
  }

  class UnknownVideoDecoderImplementationDetector extends BaseIssueDetector {
      UNKNOWN_DECODER = 'unknown';
      #lastDecoderWithIssue = {};
      performDetection(data) {
          const { connection: { id: connectionId } } = data;
          const issues = this.processData(data);
          this.setLastProcessedStats(connectionId, data);
          return issues;
      }
      performPrevStatsCleanup(payload) {
          const { connectionId, cleanupCallback } = payload;
          super.performPrevStatsCleanup({
              ...payload,
              cleanupCallback: () => {
                  delete this.#lastDecoderWithIssue[connectionId];
                  if (typeof cleanupCallback === 'function') {
                      cleanupCallback();
                  }
              },
          });
      }
      processData(data) {
          const issues = [];
          const { id: connectionId } = data.connection;
          const previousInboundRTPVideoStreamsStats = this.getLastProcessedStats(connectionId)?.video.inbound;
          data.video.inbound.forEach((streamStats) => {
              const { decoderImplementation: currentDecoder, ssrc } = streamStats;
              const prevStats = previousInboundRTPVideoStreamsStats?.find((item) => item.ssrc === ssrc);
              // skipping the first iteration on purpose
              if (!prevStats) {
                  return;
              }
              if (currentDecoder !== this.UNKNOWN_DECODER) {
                  this.setLastDecoderWithIssue(connectionId, ssrc, undefined);
                  return;
              }
              if (!this.hadLastDecoderWithIssue(connectionId, ssrc)) {
                  this.setLastDecoderWithIssue(connectionId, ssrc, this.UNKNOWN_DECODER);
                  const statsSample = {
                      mimeType: streamStats.mimeType,
                      decoderImplementation: currentDecoder,
                  };
                  issues.push({
                      ssrc,
                      statsSample,
                      type: exports.IssueType.Stream,
                      reason: exports.IssueReason.UnknownVideoDecoderIssue,
                      trackIdentifier: streamStats.track.trackIdentifier,
                  });
              }
          });
          return issues;
      }
      setLastDecoderWithIssue(connectionId, ssrc, decoder) {
          const issues = this.#lastDecoderWithIssue[connectionId] ?? {};
          if (decoder === undefined) {
              delete issues[ssrc];
          }
          else {
              issues[ssrc] = decoder;
          }
          this.#lastDecoderWithIssue[connectionId] = issues;
      }
      hadLastDecoderWithIssue(connectionId, ssrc) {
          const issues = this.#lastDecoderWithIssue[connectionId];
          const decoder = issues && issues[ssrc];
          return decoder === this.UNKNOWN_DECODER;
      }
  }

  const checkIsConnectionClosed = (pc) => pc.iceConnectionState === 'closed' || pc.connectionState === 'closed';
  const calcValueRate = (stats, prevStats, statPropName) => {
      if (!prevStats) {
          return 0;
      }
      const currentVal = stats[statPropName];
      const prevVal = prevStats[statPropName];
      if (currentVal == null || prevVal == null) {
          return 0;
      }
      // Time is in such format: 1657105307362.007 (mcs after dot)
      const timeDiffMs = (Math.floor(stats.timestamp) - Math.floor(prevStats.timestamp));
      if (timeDiffMs === 0) {
          return 0;
      }
      const valDiff = Number(currentVal) - Number(prevVal);
      return (valDiff / timeDiffMs) * 1000;
  };
  const calcBitrate = (stats, prevStats, statPropName) => 8 * calcValueRate(stats, prevStats, statPropName);

  class CompositeRTCStatsParser {
      connections = [];
      statsParser;
      constructor(params) {
          this.statsParser = params.statsParser;
      }
      listConnections() {
          return [...this.connections];
      }
      addPeerConnection(payload) {
          this.connections.push({
              id: payload.id ?? String(Date.now() + Math.random().toString(32)),
              pc: payload.pc,
          });
      }
      removePeerConnection(payload) {
          const pcIdxToDelete = this.connections.findIndex(({ pc }) => pc === payload.pc);
          if (pcIdxToDelete >= 0) {
              this.removeConnectionsByIndexes([pcIdxToDelete]);
          }
      }
      async parse() {
          // DESC order to remove elements afterwards without index shifting
          const closedConnectionsIndexesDesc = [];
          const statsPromises = this.connections.map(async (info, index) => {
              if (checkIsConnectionClosed(info.pc)) {
                  closedConnectionsIndexesDesc.unshift(index);
                  return undefined;
              }
              return this.statsParser.parse(info);
          });
          if (closedConnectionsIndexesDesc.length) {
              this.removeConnectionsByIndexes(closedConnectionsIndexesDesc);
          }
          const statsItemsByPC = await Promise.all(statsPromises);
          return statsItemsByPC.filter((item) => item !== undefined);
      }
      removeConnectionsByIndexes(closedConnectionsIndexesDesc) {
          closedConnectionsIndexesDesc.forEach((idx) => {
              this.connections.splice(idx, 1);
          });
      }
  }

  class RTCStatsParser {
      prevStats = new Map();
      allowedReportTypes = new Set([
          'candidate-pair',
          'inbound-rtp',
          'outbound-rtp',
          'remote-outbound-rtp',
          'remote-inbound-rtp',
          'track',
          'transport',
      ]);
      ignoreSSRCList;
      logger;
      constructor(params) {
          this.ignoreSSRCList = params.ignoreSSRCList ?? [];
          this.logger = params.logger;
      }
      get previouslyParsedStatsConnectionsIds() {
          return [...this.prevStats.keys()];
      }
      async parse(connection) {
          if (checkIsConnectionClosed(connection.pc)) {
              this.logger.debug('Skip stats parsing. Connection is closed.', { connection });
              return undefined;
          }
          return this.getConnectionStats(connection);
      }
      async getConnectionStats(info) {
          const { pc, id } = info;
          try {
              const beforeGetStats = Date.now();
              const recieversWithActiveTracks = pc.getReceivers().filter((r) => r.track?.enabled);
              const sendersWithActiveTracks = pc.getSenders().filter((s) => s.track?.enabled);
              const receiversStats = await Promise.all(recieversWithActiveTracks.map((r) => r.getStats()));
              const sendersStats = await Promise.all(sendersWithActiveTracks.map((r) => r.getStats()));
              const stats = this.mapReportsStats([...receiversStats, ...sendersStats], info);
              return {
                  id,
                  stats,
                  timeTaken: Date.now() - beforeGetStats,
              };
          }
          catch (error) {
              this.logger.error('Failed to get stats for PC', { id, pc, error });
              return undefined;
          }
      }
      mapReportsStats(reports, connectionData) {
          const mappedStats = {
              audio: {
                  inbound: [],
                  outbound: [],
              },
              video: {
                  inbound: [],
                  outbound: [],
              },
              connection: {},
              remote: {
                  video: {
                      inbound: [],
                      outbound: [],
                  },
                  audio: {
                      inbound: [],
                      outbound: [],
                  },
              },
          };
          reports.forEach((rtcStats) => {
              rtcStats.forEach((reportItem) => {
                  if (!this.allowedReportTypes.has(reportItem.type)) {
                      return;
                  }
                  this.updateMappedStatsWithReportItemData(reportItem, mappedStats, rtcStats);
              });
          });
          const { id: connectionId } = connectionData;
          const prevStatsData = this.prevStats.get(connectionId);
          if (prevStatsData) {
              this.propagateStatsWithRateValues(mappedStats, prevStatsData.stats);
          }
          this.prevStats.set(connectionId, {
              stats: mappedStats,
              ts: Date.now(),
          });
          scheduleTask({
              taskId: connectionId,
              delayMs: CLEANUP_PREV_STATS_TTL_MS,
              callback: () => (this.prevStats.delete(connectionId)),
          });
          return mappedStats;
      }
      updateMappedStatsWithReportItemData(statsItem, mappedStats, stats) {
          const type = statsItem.type;
          if (type === 'candidate-pair' && statsItem.state === 'succeeded' && statsItem.nominated) {
              mappedStats.connection = this.prepareConnectionStats(statsItem, stats);
              return;
          }
          const mediaType = this.getMediaType(statsItem);
          if (!mediaType) {
              return;
          }
          const ssrc = statsItem.ssrc;
          if (ssrc && this.ignoreSSRCList.includes(ssrc)) {
              return;
          }
          if (type === 'outbound-rtp') {
              const trackInfo = stats.get(statsItem.trackId)
                  || stats.get(statsItem.mediaSourceId) || {};
              const statsToAdd = {
                  ...statsItem,
                  track: { ...trackInfo },
              };
              if (mediaType === 'audio') {
                  mappedStats[mediaType].outbound.push(statsToAdd);
              }
              else {
                  mappedStats[mediaType].outbound.push(statsToAdd);
              }
              return;
          }
          if (type === 'inbound-rtp') {
              const trackInfo = stats.get(statsItem.trackId)
                  || stats.get(statsItem.mediaSourceId) || {};
              this.mapConnectionStatsIfNecessary(mappedStats, statsItem, stats);
              const statsToAdd = {
                  ...statsItem,
                  track: { ...trackInfo },
              };
              if (mediaType === 'audio') {
                  mappedStats[mediaType].inbound.push(statsToAdd);
              }
              else {
                  mappedStats[mediaType].inbound.push(statsToAdd);
              }
              return;
          }
          if (type === 'remote-outbound-rtp') {
              mappedStats.remote[mediaType].outbound
                  .push({ ...statsItem });
              return;
          }
          if (type === 'remote-inbound-rtp') {
              this.mapConnectionStatsIfNecessary(mappedStats, statsItem, stats);
              mappedStats.remote[mediaType].inbound
                  .push({ ...statsItem });
          }
      }
      getMediaType(reportItem) {
          const mediaType = (reportItem.mediaType || reportItem.kind);
          if (!['audio', 'video'].includes(mediaType)) {
              const { id: reportId } = reportItem;
              if (!reportId) {
                  return undefined;
              }
              // Check for Safari browser as it does not have kind and mediaType props
              if (String(reportId).includes('Video')) {
                  return 'video';
              }
              if (String(reportId).includes('Audio')) {
                  return 'audio';
              }
              return undefined;
          }
          return mediaType;
      }
      propagateStatsWithRateValues(newStats, prevStats) {
          newStats.audio.inbound.forEach((report) => {
              const prev = prevStats.audio.inbound.find(({ id }) => id === report.id);
              report.bitrate = calcBitrate(report, prev, 'bytesReceived');
              report.packetRate = calcBitrate(report, prev, 'packetsReceived');
          });
          newStats.audio.outbound.forEach((report) => {
              const prev = prevStats.audio.outbound.find(({ id }) => id === report.id);
              report.bitrate = calcBitrate(report, prev, 'bytesSent');
              report.packetRate = calcBitrate(report, prev, 'packetsSent');
          });
          newStats.video.inbound.forEach((report) => {
              const prev = prevStats.video.inbound.find(({ id }) => id === report.id);
              report.bitrate = calcBitrate(report, prev, 'bytesReceived');
              report.packetRate = calcBitrate(report, prev, 'packetsReceived');
          });
          newStats.video.outbound.forEach((report) => {
              const prev = prevStats.video.outbound.find(({ id }) => id === report.id);
              report.bitrate = calcBitrate(report, prev, 'bytesSent');
              report.packetRate = calcBitrate(report, prev, 'packetsSent');
          });
      }
      mapConnectionStatsIfNecessary(mappedStats, statsItem, stats) {
          if (mappedStats.connection.id || !statsItem.transportId) {
              return;
          }
          const transportStats = stats.get(statsItem.transportId);
          if (transportStats && transportStats.selectedCandidatePairId) {
              const candidatePair = stats.get(transportStats.selectedCandidatePairId);
              mappedStats.connection = this.prepareConnectionStats(candidatePair, stats);
          }
      }
      prepareConnectionStats(candidatePair, stats) {
          if (!(candidatePair && stats)) {
              return {};
          }
          const connectionStats = { ...candidatePair };
          if (connectionStats.remoteCandidateId) {
              const candidate = stats.get(connectionStats.remoteCandidateId);
              connectionStats.remote = { ...candidate };
          }
          if (connectionStats.localCandidateId) {
              const candidate = stats.get(connectionStats.localCandidateId);
              connectionStats.local = { ...candidate };
          }
          return connectionStats;
      }
  }

  const createLogger = () => ({
      debug: () => {
      },
      info: () => {
      },
      warn: () => {
      },
      error: () => {
      },
  });

  class WebRTCIssueDetector {
      eventEmitter;
      #running = false;
      detectors = [];
      networkScoresCalculator;
      statsReporter;
      compositeStatsParser;
      logger;
      autoAddPeerConnections;
      constructor(params) {
          this.logger = params.logger ?? createLogger();
          this.eventEmitter = params.issueEmitter ?? new WebRTCIssueEmitter();
          if (params.onIssues) {
              this.eventEmitter.on(exports.EventType.Issue, params.onIssues);
          }
          if (params.onNetworkScoresUpdated) {
              this.eventEmitter.on(exports.EventType.NetworkScoresUpdated, params.onNetworkScoresUpdated);
          }
          this.detectors = params.detectors ?? [
              new QualityLimitationsIssueDetector(),
              new FramesDroppedIssueDetector(),
              new FramesEncodedSentIssueDetector(),
              new InboundNetworkIssueDetector(),
              new OutboundNetworkIssueDetector(),
              new NetworkMediaSyncIssueDetector(),
              new AvailableOutgoingBitrateIssueDetector(),
              new UnknownVideoDecoderImplementationDetector(),
          ];
          this.networkScoresCalculator = params.networkScoresCalculator ?? new NetworkScoresCalculator();
          this.compositeStatsParser = params.compositeStatsParser ?? new CompositeRTCStatsParser({
              statsParser: new RTCStatsParser({
                  ignoreSSRCList: params.ignoreSSRCList,
                  logger: this.logger,
              }),
          });
          this.statsReporter = params.statsReporter ?? new PeriodicWebRTCStatsReporter({
              compositeStatsParser: this.compositeStatsParser,
              getStatsInterval: params.getStatsInterval ?? 5000,
          });
          window.wid = this;
          this.autoAddPeerConnections = params.autoAddPeerConnections ?? true;
          if (this.autoAddPeerConnections) {
              this.wrapRTCPeerConnection();
          }
          this.statsReporter.on(PeriodicWebRTCStatsReporter.STATS_REPORT_READY_EVENT, (report) => {
              this.detectIssues({
                  data: report.stats,
              });
              this.calculateNetworkScores(report.stats);
          });
          this.statsReporter.on(PeriodicWebRTCStatsReporter.STATS_REPORTS_PARSED, (data) => {
              const payload = {
                  timeTaken: data.timeTaken,
                  ts: Date.now(),
              };
              this.eventEmitter.emit(exports.EventType.StatsParsingFinished, payload);
          });
      }
      watchNewPeerConnections() {
          if (!this.autoAddPeerConnections) {
              throw new Error('Auto add peer connections was disabled in the constructor.');
          }
          if (this.#running) {
              this.logger.warn('WebRTCIssueDetector is already started. Skip processing');
              return;
          }
          this.logger.info('Start watching peer connections');
          this.#running = true;
          this.statsReporter.startReporting();
      }
      stopWatchingNewPeerConnections() {
          if (!this.#running) {
              this.logger.warn('WebRTCIssueDetector is already stopped. Skip processing');
              return;
          }
          this.logger.info('Stop watching peer connections');
          this.#running = false;
          this.statsReporter.stopReporting();
      }
      handleNewPeerConnection(pc) {
          if (!this.#running && this.autoAddPeerConnections) {
              this.logger.debug('Skip handling new peer connection. Detector is not running', pc);
              return;
          }
          if (!this.#running && this.autoAddPeerConnections === false) {
              this.logger.info('Starting stats reporting for new peer connection');
              this.#running = true;
              this.statsReporter.startReporting();
          }
          this.logger.debug('Handling new peer connection', pc);
          this.compositeStatsParser.addPeerConnection({ pc });
      }
      emitIssues(issues) {
          this.eventEmitter.emit(exports.EventType.Issue, issues);
      }
      detectIssues({ data }) {
          const issues = this.detectors.reduce((acc, detector) => [...acc, ...detector.detect(data)], []);
          if (issues.length > 0) {
              this.emitIssues(issues);
          }
      }
      calculateNetworkScores(data) {
          const networkScores = this.networkScoresCalculator.calculate(data);
          this.eventEmitter.emit(exports.EventType.NetworkScoresUpdated, networkScores);
      }
      wrapRTCPeerConnection() {
          if (!window.RTCPeerConnection) {
              this.logger.warn('No RTCPeerConnection found in browser window. Skipping');
              return;
          }
          const OriginalRTCPeerConnection = window.RTCPeerConnection;
          const onConnectionCreated = (pc) => this.handleNewPeerConnection(pc);
          function WIDRTCPeerConnection(rtcConfig) {
              const connection = new OriginalRTCPeerConnection(rtcConfig);
              onConnectionCreated(connection);
              return connection;
          }
          WIDRTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
          window.RTCPeerConnection = WIDRTCPeerConnection;
      }
  }

  exports.AvailableOutgoingBitrateIssueDetector = AvailableOutgoingBitrateIssueDetector;
  exports.BaseIssueDetector = BaseIssueDetector;
  exports.CompositeRTCStatsParser = CompositeRTCStatsParser;
  exports.FramesDroppedIssueDetector = FramesDroppedIssueDetector;
  exports.FramesEncodedSentIssueDetector = FramesEncodedSentIssueDetector;
  exports.InboundNetworkIssueDetector = InboundNetworkIssueDetector;
  exports.NetworkMediaSyncIssueDetector = NetworkMediaSyncIssueDetector;
  exports.NetworkScoresCalculator = NetworkScoresCalculator;
  exports.OutboundNetworkIssueDetector = OutboundNetworkIssueDetector;
  exports.PeriodicWebRTCStatsReporter = PeriodicWebRTCStatsReporter;
  exports.QualityLimitationsIssueDetector = QualityLimitationsIssueDetector;
  exports.RTCStatsParser = RTCStatsParser;
  exports.UnknownVideoDecoderImplementationDetector = UnknownVideoDecoderImplementationDetector;
  exports.WebRTCIssueEmitter = WebRTCIssueEmitter;
  exports["default"] = WebRTCIssueDetector;

  Object.defineProperty(exports, '__esModule', { value: true });

})(this.webrtcIssuesDetector = this.webrtcIssuesDetector || {});
