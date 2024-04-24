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

  // Unique ID creation requires a high quality random # generator. In the browser we therefore
  // require the crypto API and do not support built-in fallback to lower quality random number
  // generators (like Math.random()).
  var getRandomValues,rnds8=new Uint8Array(16);function rng(){// lazy load so that environments that need to polyfill have a chance to do so
  if(!getRandomValues&&(getRandomValues="undefined"!=typeof crypto&&crypto.getRandomValues&&crypto.getRandomValues.bind(crypto)||"undefined"!=typeof msCrypto&&"function"==typeof msCrypto.getRandomValues&&msCrypto.getRandomValues.bind(msCrypto),!getRandomValues))throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");return getRandomValues(rnds8)}

  var REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;

  function validate(a){return "string"==typeof a&&REGEX.test(a)}

  /**
   * Convert array of 16 byte values to UUID string format of the form:
   * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
   */for(var byteToHex=[],i=0;256>i;++i)byteToHex.push((i+256).toString(16).substr(1));function stringify(a){var b=1<arguments.length&&arguments[1]!==void 0?arguments[1]:0,c=(byteToHex[a[b+0]]+byteToHex[a[b+1]]+byteToHex[a[b+2]]+byteToHex[a[b+3]]+"-"+byteToHex[a[b+4]]+byteToHex[a[b+5]]+"-"+byteToHex[a[b+6]]+byteToHex[a[b+7]]+"-"+byteToHex[a[b+8]]+byteToHex[a[b+9]]+"-"+byteToHex[a[b+10]]+byteToHex[a[b+11]]+byteToHex[a[b+12]]+byteToHex[a[b+13]]+byteToHex[a[b+14]]+byteToHex[a[b+15]]).toLowerCase();// Note: Be careful editing this code!  It's been tuned for performance
  // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
  // Consistency check for valid UUID.  If this throws, it's likely due to one
  // of the following:
  // - One or more input array values don't map to a hex octet (leading to
  // "undefined" in the uuid)
  // - Invalid input values for the RFC `version` or `variant` fields
  if(!validate(c))throw TypeError("Stringified UUID is invalid");return c}

  function v4(a,b,c){a=a||{};var d=a.random||(a.rng||rng)();// Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  // Copy bytes to buffer, if provided
  if(d[6]=64|15&d[6],d[8]=128|63&d[8],b){c=c||0;for(var e=0;16>e;++e)b[c+e]=d[e];return b}return stringify(d)}

  /**
   * A set of methods used to parse the rtc stats
   */
  function addAdditionalData(currentStats, previousStats) {
      // we need the previousStats stats to compute thse values
      if (!previousStats)
          return currentStats;
      // audio
      // inbound
      currentStats.audio.inbound.map((report) => {
          let prev = previousStats.audio.inbound.find(r => r.id === report.id);
          report.bitrate = computeBitrate(report, prev, 'bytesReceived');
          report.packetRate = computeBitrate(report, prev, 'packetsReceived');
      });
      // outbound
      currentStats.audio.outbound.map((report) => {
          let prev = previousStats.audio.outbound.find(r => r.id === report.id);
          report.bitrate = computeBitrate(report, prev, 'bytesSent');
          report.packetRate = computeBitrate(report, prev, 'packetsSent');
      });
      // video
      // inbound
      currentStats.video.inbound.map((report) => {
          let prev = previousStats.video.inbound.find(r => r.id === report.id);
          report.bitrate = computeBitrate(report, prev, 'bytesReceived');
          report.packetRate = computeBitrate(report, prev, 'packetsReceived');
      });
      // outbound
      currentStats.video.outbound.map((report) => {
          let prev = previousStats.video.outbound.find(r => r.id === report.id);
          report.bitrate = computeBitrate(report, prev, 'bytesSent');
          report.packetRate = computeBitrate(report, prev, 'packetsSent');
      });
      return currentStats;
  }
  function getCandidatePairInfo(candidatePair, stats) {
      if (!candidatePair || !stats)
          return {};
      const connection = { ...candidatePair };
      if (connection.localCandidateId) {
          const localCandidate = stats.get(connection.localCandidateId);
          connection.local = { ...localCandidate };
      }
      if (connection.remoteCandidateId) {
          const remoteCandidate = stats.get(connection.remoteCandidateId);
          connection.remote = { ...remoteCandidate };
      }
      return connection;
  }
  // Takes two stats reports and determines the rate based on two counter readings
  // and the time between them (which is in units of milliseconds).
  function computeRate(newReport, oldReport, statName) {
      const newVal = newReport[statName];
      const oldVal = oldReport ? oldReport[statName] : null;
      if (newVal === null || oldVal === null) {
          return null;
      }
      return (newVal - oldVal) / (newReport.timestamp - oldReport.timestamp) * 1000;
  }
  // Convert a byte rate to a bit rate.
  function computeBitrate(newReport, oldReport, statName) {
      return computeRate(newReport, oldReport, statName) * 8;
  }
  function map2obj(stats) {
      if (!stats.entries) {
          return stats;
      }
      const o = {};
      stats.forEach(function (v, k) {
          o[k] = v;
      });
      return o;
  }
  // Enumerates the new standard compliant stats using local and remote track ids.
  function parseStats(stats, previousStats, options = {}) {
      // Create an object structure with all the needed stats and types that we care
      // about. This allows to map the getStats stats to other stats names.
      if (!stats)
          return null;
      /**
       * The starting object where we will save the details from the stats report
       * @type {Object}
       */
      let statsObject = {
          audio: {
              inbound: [],
              outbound: []
          },
          video: {
              inbound: [],
              outbound: []
          },
          connection: {
              inbound: [],
              outbound: []
          }
      };
      // if we want to collect remote data also
      if (options.remote) {
          statsObject.remote = {
              audio: {
                  inbound: [],
                  outbound: []
              },
              video: {
                  inbound: [],
                  outbound: []
              }
          };
      }
      for (const report of stats.values()) {
          switch (report.type) {
              case 'outbound-rtp': {
                  const mediaType = report.mediaType || report.kind;
                  const codecInfo = {};
                  let trackData = {};
                  if (!['audio', 'video'].includes(mediaType))
                      continue;
                  if (report.codecId) {
                      const codec = stats.get(report.codecId);
                      if (codec) {
                          codecInfo.clockRate = codec.clockRate;
                          codecInfo.mimeType = codec.mimeType;
                          codecInfo.payloadType = codec.payloadType;
                      }
                  }
                  trackData = stats.get(report.mediaSourceId) || stats.get(report.trackId) || {};
                  statsObject[mediaType].outbound.push({ ...report, ...codecInfo, track: { ...trackData } });
                  break;
              }
              case 'inbound-rtp': {
                  let mediaType = report.mediaType || report.kind;
                  let trackData = {};
                  const codecInfo = {};
                  // Safari is missing mediaType and kind for 'inbound-rtp'
                  if (!['audio', 'video'].includes(mediaType)) {
                      if (report.id.includes('Video'))
                          mediaType = 'video';
                      else if (report.id.includes('Audio'))
                          mediaType = 'audio';
                      else
                          continue;
                  }
                  if (report.codecId) {
                      const codec = stats.get(report.codecId);
                      if (codec) {
                          codecInfo.clockRate = codec.clockRate;
                          codecInfo.mimeType = codec.mimeType;
                          codecInfo.payloadType = codec.payloadType;
                      }
                  }
                  // if we don't have connection details already saved
                  // and the transportId is present (most likely chrome)
                  // get the details from the candidate-pair
                  if (!statsObject.connection.id && report.transportId) {
                      const transport = stats.get(report.transportId);
                      if (transport && transport.selectedCandidatePairId) {
                          const candidatePair = stats.get(transport.selectedCandidatePairId);
                          statsObject.connection = getCandidatePairInfo(candidatePair, stats);
                      }
                  }
                  trackData = stats.get(report.mediaSourceId) || stats.get(report.trackId) || {};
                  statsObject[mediaType].inbound.push({ ...report, ...codecInfo, track: { ...trackData } });
                  break;
              }
              case 'peer-connection': {
                  statsObject.connection.dataChannelsClosed = report.dataChannelsClosed;
                  statsObject.connection.dataChannelsOpened = report.dataChannelsOpened;
                  break;
              }
              case 'remote-inbound-rtp': {
                  if (!options.remote)
                      break;
                  let mediaType = report.mediaType || report.kind;
                  const codecInfo = {};
                  // Safari is missing mediaType and kind for 'inbound-rtp'
                  if (!['audio', 'video'].includes(mediaType)) {
                      if (report.id.includes('Video'))
                          mediaType = 'video';
                      else if (report.id.includes('Audio'))
                          mediaType = 'audio';
                      else
                          continue;
                  }
                  if (report.codecId) {
                      const codec = stats.get(report.codecId);
                      if (codec) {
                          codecInfo.clockRate = codec.clockRate;
                          codecInfo.mimeType = codec.mimeType;
                          codecInfo.payloadType = codec.payloadType;
                      }
                  }
                  // if we don't have connection details already saved
                  // and the transportId is present (most likely chrome)
                  // get the details from the candidate-pair
                  if (!statsObject.connection.id && report.transportId) {
                      const transport = stats.get(report.transportId);
                      if (transport && transport.selectedCandidatePairId) {
                          const candidatePair = stats.get(transport.selectedCandidatePairId);
                          statsObject.connection = getCandidatePairInfo(candidatePair, stats);
                      }
                  }
                  statsObject.remote[mediaType].inbound.push({ ...report, ...codecInfo });
                  break;
              }
              case 'remote-outbound-rtp': {
                  if (!options.remote)
                      break;
                  const mediaType = report.mediaType || report.kind;
                  const codecInfo = {};
                  if (!['audio', 'video'].includes(mediaType))
                      continue;
                  if (report.codecId) {
                      const codec = stats.get(report.codecId);
                      if (codec) {
                          codecInfo.clockRate = codec.clockRate;
                          codecInfo.mimeType = codec.mimeType;
                          codecInfo.payloadType = codec.payloadType;
                      }
                  }
                  statsObject.remote[mediaType].outbound.push({ ...report, ...codecInfo });
                  break;
              }
          }
      }
      // if we didn't find a candidate-pair while going through inbound-rtp
      // look for it again
      if (!statsObject.connection.id) {
          for (const report of stats.values()) {
              // select the current active candidate-pair report
              if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
                  statsObject.connection = getCandidatePairInfo(report, stats);
              }
          }
      }
      statsObject = addAdditionalData(statsObject, previousStats);
      return statsObject;
  }

  // used to keep track of events listeners. useful when we want to remove them
  let eventListeners = {};
  // used to save the original getUsermedia native method
  let origGetUserMedia;
  // tracks that have been obtained from calling getUsermedia
  let localTracks = [];
  class WebRTCStats extends EventEmitter {
      constructor(constructorOptions) {
          super();
          this.monitoringSetInterval = 0;
          this.connectionMonitoringSetInterval = 0;
          this.connectionMonitoringInterval = 1000;
          this.remote = true;
          this.peersToMonitor = {};
          /**
           * Used to keep track of all the events
           */
          this.timeline = [];
          /**
           * A list of stats to look after
           */
          this.statsToMonitor = [
              'inbound-rtp',
              'outbound-rtp',
              'remote-inbound-rtp',
              'remote-outbound-rtp',
              'peer-connection',
              'data-channel',
              'stream',
              'track',
              'sender',
              'receiver',
              'transport',
              'candidate-pair',
              'local-candidate',
              'remote-candidate'
          ];
          // only works in the browser
          if (typeof window === 'undefined') {
              throw new Error('WebRTCStats only works in browser');
          }
          const options = { ...constructorOptions };
          this.isEdge = !!window.RTCIceGatherer;
          this.getStatsInterval = options.getStatsInterval || 1000;
          this.rawStats = !!options.rawStats;
          this.statsObject = !!options.statsObject;
          this.filteredStats = !!options.filteredStats;
          // getUserMedia options
          this.shouldWrapGetUserMedia = !!options.wrapGetUserMedia;
          if (typeof options.remote === 'boolean') {
              this.remote = options.remote;
          }
          // If we want to enable debug
          this.debug = !!options.debug;
          this.logLevel = options.logLevel || "none";
          // add event listeners for getUserMedia
          if (this.shouldWrapGetUserMedia) {
              this.wrapGetUserMedia();
          }
      }
      async addPeer(peerId, pc) {
          console.warn('The addPeer() method has been deprecated, please use addConnection()');
          return this.addConnection({
              peerId,
              pc
          });
      }
      /**
       * Start tracking a RTCPeerConnection
       * @param {Object} options The options object
       */
      async addConnection(options) {
          const { pc, peerId } = options;
          let { connectionId, remote } = options;
          remote = typeof remote === 'boolean' ? remote : this.remote;
          if (!pc || !(pc instanceof RTCPeerConnection)) {
              throw new Error(`Missing argument 'pc' or is not of instance RTCPeerConnection`);
          }
          if (!peerId) {
              throw new Error('Missing argument peerId');
          }
          if (this.isEdge) {
              throw new Error('Can\'t monitor peers in Edge at this time.');
          }
          // if we are already monitoring this peerId, check if the user sent the same connection twice
          if (this.peersToMonitor[peerId]) {
              // if the user sent a connectionId
              if (connectionId && connectionId in this.peersToMonitor[peerId]) {
                  throw new Error(`We are already monitoring connection with id ${connectionId}.`);
              }
              else {
                  for (let id in this.peersToMonitor[peerId]) {
                      const peerConnection = this.peersToMonitor[peerId][id];
                      if (peerConnection.pc === pc) {
                          throw new Error(`We are already monitoring peer with id ${peerId}.`);
                      }
                      // remove an connection if it's already closed.
                      if (peerConnection.pc.connectionState === 'closed') {
                          this.removeConnection({ pc: peerConnection.pc });
                      }
                  }
              }
          }
          const config = pc.getConfiguration();
          // don't log credentials
          if (config.iceServers) {
              config.iceServers.forEach(function (server) {
                  delete server.credential;
              });
          }
          // if the user didn't send a connectionId, we should generate one
          if (!connectionId) {
              connectionId = v4();
          }
          this.emitEvent({
              event: 'addConnection',
              tag: 'peer',
              peerId,
              connectionId,
              data: {
                  options: options,
                  peerConfiguration: config
              }
          });
          this.monitorPeer({
              peerId,
              connectionId,
              pc,
              remote
          });
          return {
              connectionId
          };
      }
      /**
       * Returns the timeline of events
       * If a tag is it will filter out events based on it
       * @param  {String} tag The tag to filter events (optional)
       * @return {Array}     The timeline array (or sub array if tag is defined)
       */
      getTimeline(tag) {
          // sort the events by timestamp
          this.timeline = this.timeline.sort((event1, event2) => event1.timestamp.getTime() - event2.timestamp.getTime());
          if (tag) {
              return this.timeline.filter((event) => event.tag === tag);
          }
          return this.timeline;
      }
      get logger() {
          const canLog = (requestLevel) => {
              const allLevels = ['none', 'error', 'warn', 'info', 'debug'];
              return allLevels.slice(0, allLevels.indexOf(this.logLevel) + 1).indexOf(requestLevel) > -1;
          };
          return {
              error(...msg) {
                  if (this.debug && canLog('error'))
                      console.error(`[webrtc-stats][error] `, ...msg);
              },
              warn(...msg) {
                  if (this.debug && canLog('warn'))
                      console.warn(`[webrtc-stats][warn] `, ...msg);
              },
              info(...msg) {
                  if (this.debug && canLog('info'))
                      console.log(`[webrtc-stats][info] `, ...msg);
              },
              debug(...msg) {
                  if (this.debug && canLog('debug'))
                      console.debug(`[webrtc-stats][debug] `, ...msg);
              }
          };
      }
      /**
       * Removes a connection from the list of connections to watch
       * @param {RemoveConnectionOptions} options The options object for this method
       */
      removeConnection(options) {
          let { connectionId, pc } = options;
          let peerId;
          if (!pc && !connectionId) {
              throw new Error('Missing arguments. You need to either send pc or a connectionId.');
          }
          // if the user sent a connectionId
          if (connectionId) {
              if (typeof connectionId !== 'string') {
                  throw new Error('connectionId must be a string.');
              }
              for (let pId in this.peersToMonitor) {
                  if (connectionId in this.peersToMonitor[pId]) {
                      pc = this.peersToMonitor[pId][connectionId].pc;
                      peerId = pId;
                  }
              }
              // else, if the user sent a pc
          }
          else if (pc) {
              if (!(pc instanceof RTCPeerConnection)) {
                  throw new Error('pc must be an instance of RTCPeerConnection.');
              }
              // loop through all the peers
              for (let pId in this.peersToMonitor) {
                  // loop through all the connections
                  for (let cId in this.peersToMonitor[pId]) {
                      // until we find the one we're searching for
                      if (this.peersToMonitor[pId][cId].pc === pc) {
                          connectionId = cId;
                          peerId = pId;
                      }
                  }
              }
          }
          if (!pc || !connectionId) {
              throw new Error('Could not find the desired connection.');
          }
          // remove listeners
          this.removePeerConnectionEventListeners(connectionId, pc);
          // delete it
          delete this.peersToMonitor[peerId][connectionId];
          // check if the user has no more connections
          if (Object.values(this.peersToMonitor[peerId]).length === 0) {
              delete this.peersToMonitor[peerId];
          }
          return {
              connectionId
          };
      }
      /**
       * Used to stop listeners on all connections and remove all other event listeners
       */
      removeAllPeers() {
          for (let peerId in this.peersToMonitor) {
              this.removePeer(peerId);
          }
      }
      /**
       * Removes all the connection for a peer
       * @param {string} id The peer id
       */
      removePeer(id) {
          this.logger.info(`Removing PeerConnection with id ${id}.`);
          if (!this.peersToMonitor[id])
              return;
          for (let connectionId in this.peersToMonitor[id]) {
              let pc = this.peersToMonitor[id][connectionId].pc;
              this.removePeerConnectionEventListeners(connectionId, pc);
          }
          // remove from peersToMonitor
          delete this.peersToMonitor[id];
      }
      /**
       * Used to remove all event listeners and reset the state of the lib
       */
      destroy() {
          // remove all peer connection event listeners
          this.removeAllPeers();
          localTracks.forEach((track) => {
              this.removeTrackEventListeners(track);
          });
          localTracks = [];
          // if we wrapped gUM initially
          if (this.shouldWrapGetUserMedia && origGetUserMedia) {
              // put back the original
              navigator.mediaDevices.getUserMedia = origGetUserMedia;
          }
      }
      /**
       * Used to add to the list of peers to get stats for
       * @param  {string} peerId
       * @param  {RTCPeerConnection} pc
       * @param {MonitorPeerOptions} options
       */
      monitorPeer(options) {
          let { peerId, connectionId, pc, remote } = options;
          if (!pc) {
              this.logger.warn('Did not receive pc argument when calling monitorPeer()');
              return;
          }
          const monitorPeerObject = {
              pc: pc,
              connectionId,
              stream: null,
              stats: {
                  // keep a reference of the current stat
                  parsed: null,
                  raw: null
              },
              options: {
                  remote
              }
          };
          if (this.peersToMonitor[peerId]) {
              // if we are already watching this connectionId
              if (connectionId in this.peersToMonitor[peerId]) {
                  this.logger.warn(`Already watching connection with ID ${connectionId}`);
                  return;
              }
              this.peersToMonitor[peerId][connectionId] = monitorPeerObject;
          }
          else {
              this.peersToMonitor[peerId] = { [connectionId]: monitorPeerObject };
          }
          this.addPeerConnectionEventListeners(peerId, connectionId, pc);
          // start monitoring from the first peer added
          if (this.numberOfMonitoredPeers === 1) {
              this.startStatsMonitoring();
              this.startConnectionStateMonitoring();
          }
      }
      /**
       * Used to start the setTimeout and request getStats from the peers
       */
      startStatsMonitoring() {
          if (this.monitoringSetInterval)
              return;
          this.monitoringSetInterval = window.setInterval(() => {
              // if we ran out of peers to monitor
              if (!this.numberOfMonitoredPeers) {
                  this.stopStatsMonitoring();
              }
              this.getStats() // get stats from all peer connections
                  .then((statsEvents) => {
                  statsEvents.forEach((statsEventObject) => {
                      // add it to the timeline and also emit the stats event
                      this.emitEvent(statsEventObject);
                  });
              });
          }, this._getStatsInterval);
      }
      stopStatsMonitoring() {
          if (this.monitoringSetInterval) {
              window.clearInterval(this.monitoringSetInterval);
              this.monitoringSetInterval = 0;
          }
      }
      async getStats(id = null) {
          this.logger.info(id ? `Getting stats from peer ${id}` : `Getting stats from all peers`);
          let peersToAnalyse = {};
          // if we want the stats for a specific peer
          if (id) {
              if (!this.peersToMonitor[id]) {
                  throw new Error(`Cannot get stats. Peer with id ${id} does not exist`);
              }
              peersToAnalyse[id] = this.peersToMonitor[id];
          }
          else {
              // else, get stats for all of them
              peersToAnalyse = this.peersToMonitor;
          }
          let statsEventList = [];
          for (const id in peersToAnalyse) {
              for (const connectionId in peersToAnalyse[id]) {
                  const peerObject = peersToAnalyse[id][connectionId];
                  const pc = peerObject.pc;
                  // if this connection is closed, continue
                  if (!pc || this.checkIfConnectionIsClosed(id, connectionId, pc)) {
                      continue;
                  }
                  try {
                      const before = this.getTimestamp();
                      const prom = pc.getStats(null);
                      if (prom) {
                          // TODO modify the promise to yield responses over time
                          const res = await prom;
                          const after = this.getTimestamp();
                          // create an object from the RTCStats map
                          const statsObject = map2obj(res);
                          const parseStatsOptions = { remote: peerObject.options.remote };
                          const parsedStats = parseStats(res, peerObject.stats.parsed, parseStatsOptions);
                          const statsEventObject = {
                              event: 'stats',
                              tag: 'stats',
                              peerId: id,
                              connectionId: connectionId,
                              timeTaken: after - before,
                              data: parsedStats
                          };
                          if (this.rawStats === true) {
                              statsEventObject['rawStats'] = res;
                          }
                          if (this.statsObject === true) {
                              statsEventObject['statsObject'] = statsObject;
                          }
                          if (this.filteredStats === true) {
                              statsEventObject['filteredStats'] = this.filteroutStats(statsObject);
                          }
                          statsEventList.push(statsEventObject);
                          peerObject.stats.parsed = parsedStats;
                          // peerObject.stats.raw = res
                      }
                      else {
                          this.logger.error(`PeerConnection from peer ${id} did not return any stats data`);
                      }
                  }
                  catch (e) {
                      this.logger.error(e);
                  }
              }
          }
          return statsEventList;
      }
      startConnectionStateMonitoring() {
          this.connectionMonitoringSetInterval = window.setInterval(() => {
              if (!this.numberOfMonitoredPeers) {
                  this.stopConnectionStateMonitoring();
              }
              for (const id in this.peersToMonitor) {
                  for (const connectionId in this.peersToMonitor[id]) {
                      const pc = this.peersToMonitor[id][connectionId].pc;
                      this.checkIfConnectionIsClosed(id, connectionId, pc);
                  }
              }
          }, this.connectionMonitoringInterval);
      }
      checkIfConnectionIsClosed(peerId, connectionId, pc) {
          const isClosed = this.isConnectionClosed(pc);
          if (isClosed) {
              this.removeConnection({ pc });
              // event name should be deppending on what we detect as closed
              let event = pc.connectionState === 'closed' ? 'onconnectionstatechange' : 'oniceconnectionstatechange';
              this.emitEvent({
                  event,
                  peerId,
                  connectionId,
                  tag: 'connection',
                  data: 'closed'
              });
          }
          return isClosed;
      }
      isConnectionClosed(pc) {
          return pc.connectionState === 'closed' || pc.iceConnectionState === 'closed';
      }
      stopConnectionStateMonitoring() {
          if (this.connectionMonitoringSetInterval) {
              window.clearInterval(this.connectionMonitoringSetInterval);
              this.connectionMonitoringSetInterval = 0;
          }
      }
      wrapGetUserMedia() {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              this.logger.warn(`'navigator.mediaDevices.getUserMedia' is not available in browser. Will not wrap getUserMedia.`);
              return;
          }
          this.logger.info('Wrapping getUsermedia functions.');
          origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          const getUserMediaCallback = this.parseGetUserMedia.bind(this);
          const gum = function () {
              // the first call will be with the constraints
              getUserMediaCallback({ constraints: arguments[0] });
              return origGetUserMedia.apply(navigator.mediaDevices, arguments)
                  .then((stream) => {
                  getUserMediaCallback({ stream: stream });
                  return stream;
              }, (err) => {
                  getUserMediaCallback({ error: err });
                  return Promise.reject(err);
              });
          };
          // replace the native method
          navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices);
      }
      /**
       * Filter out some stats, mainly codec and certificate
       * @param  {Object} stats The parsed rtc stats object
       * @return {Object}       The new object with some keys deleted
       */
      filteroutStats(stats = {}) {
          const fullObject = { ...stats };
          for (const key in fullObject) {
              var stat = fullObject[key];
              if (!this.statsToMonitor.includes(stat.type)) {
                  delete fullObject[key];
              }
          }
          return fullObject;
      }
      get peerConnectionListeners() {
          return {
              icecandidate: (id, connectionId, pc, e) => {
                  this.logger.debug('[pc-event] icecandidate | peerId: ${peerId}', e);
                  this.emitEvent({
                      event: 'onicecandidate',
                      tag: 'connection',
                      peerId: id,
                      connectionId,
                      data: e.candidate
                  });
              },
              track: (id, connectionId, pc, e) => {
                  this.logger.debug(`[pc-event] track | peerId: ${id}`, e);
                  const track = e.track;
                  const stream = e.streams[0];
                  // save the remote stream
                  if (id in this.peersToMonitor && connectionId in this.peersToMonitor[id]) {
                      this.peersToMonitor[id][connectionId].stream = stream;
                  }
                  this.addTrackEventListeners(track, connectionId);
                  this.emitEvent({
                      event: 'ontrack',
                      tag: 'track',
                      peerId: id,
                      connectionId,
                      data: {
                          stream: stream ? this.getStreamDetails(stream) : null,
                          track: track ? this.getMediaTrackDetails(track) : null,
                          title: e.track.kind + ':' + e.track.id + ' ' + e.streams.map(function (stream) {
                              return 'stream:' + stream.id;
                          })
                      }
                  });
              },
              signalingstatechange: (id, connectionId, pc) => {
                  this.logger.debug(`[pc-event] signalingstatechange | peerId: ${id}`);
                  this.emitEvent({
                      event: 'onsignalingstatechange',
                      tag: 'connection',
                      peerId: id,
                      connectionId,
                      data: {
                          signalingState: pc.signalingState,
                          localDescription: pc.localDescription,
                          remoteDescription: pc.remoteDescription
                      }
                  });
              },
              iceconnectionstatechange: (id, connectionId, pc) => {
                  this.logger.debug(`[pc-event] iceconnectionstatechange | peerId: ${id}`);
                  this.emitEvent({
                      event: 'oniceconnectionstatechange',
                      tag: 'connection',
                      peerId: id,
                      connectionId,
                      data: pc.iceConnectionState
                  });
              },
              icegatheringstatechange: (id, connectionId, pc) => {
                  this.logger.debug(`[pc-event] icegatheringstatechange | peerId: ${id}`);
                  this.emitEvent({
                      event: 'onicegatheringstatechange',
                      tag: 'connection',
                      peerId: id,
                      connectionId,
                      data: pc.iceGatheringState
                  });
              },
              icecandidateerror: (id, connectionId, pc, ev) => {
                  this.logger.debug(`[pc-event] icecandidateerror | peerId: ${id}`);
                  this.emitEvent({
                      event: 'onicecandidateerror',
                      tag: 'connection',
                      peerId: id,
                      connectionId,
                      error: {
                          errorCode: ev.errorCode
                      }
                  });
              },
              connectionstatechange: (id, connectionId, pc) => {
                  this.logger.debug(`[pc-event] connectionstatechange | peerId: ${id}`);
                  this.emitEvent({
                      event: 'onconnectionstatechange',
                      tag: 'connection',
                      peerId: id,
                      connectionId,
                      data: pc.connectionState
                  });
              },
              negotiationneeded: (id, connectionId, pc) => {
                  this.logger.debug(`[pc-event] negotiationneeded | peerId: ${id}`);
                  this.emitEvent({
                      event: 'onnegotiationneeded',
                      tag: 'connection',
                      peerId: id,
                      connectionId
                  });
              },
              datachannel: (id, connectionId, pc, event) => {
                  this.logger.debug(`[pc-event] datachannel | peerId: ${id}`, event);
                  this.emitEvent({
                      event: 'ondatachannel',
                      tag: 'datachannel',
                      peerId: id,
                      connectionId,
                      data: event.channel
                  });
              }
          };
      }
      addPeerConnectionEventListeners(peerId, connectionId, pc) {
          this.logger.debug(`Adding event listeners for peer ${peerId} and connection ${connectionId}.`);
          eventListeners[connectionId] = {};
          Object.keys(this.peerConnectionListeners).forEach(eventName => {
              eventListeners[connectionId][eventName] = this.peerConnectionListeners[eventName].bind(this, peerId, connectionId, pc);
              pc.addEventListener(eventName, eventListeners[connectionId][eventName], false);
          });
      }
      /**
       * Called when we get the stream from getUserMedia. We parse the stream and fire events
       * @param  {Object} options
       */
      parseGetUserMedia(options) {
          try {
              const obj = {
                  event: 'getUserMedia',
                  tag: 'getUserMedia',
                  data: { ...options }
              };
              // if we received the stream, get the details for the tracks
              if (options.stream) {
                  obj.data.details = this.parseStream(options.stream);
                  // add event listeners for local tracks as well
                  options.stream.getTracks().map((track) => {
                      this.addTrackEventListeners(track);
                      localTracks.push(track);
                  });
              }
              this.emitEvent(obj);
          }
          catch (e) { }
      }
      parseStream(stream) {
          const result = {
              audio: [],
              video: []
          };
          const tracks = stream.getTracks();
          tracks.forEach((track) => {
              result[track.kind].push(this.getMediaTrackDetails(track));
          });
          return result;
      }
      getMediaTrackDetails(track) {
          return {
              enabled: track.enabled,
              id: track.id,
              // @ts-ignore
              contentHint: track.contentHint,
              kind: track.kind,
              label: track.label,
              muted: track.muted,
              readyState: track.readyState,
              constructorName: track.constructor.name,
              capabilities: track.getCapabilities ? track.getCapabilities() : {},
              constraints: track.getConstraints ? track.getConstraints() : {},
              settings: track.getSettings ? track.getSettings() : {},
              _track: track
          };
      }
      getStreamDetails(stream) {
          return {
              active: stream.active,
              id: stream.id,
              _stream: stream
          };
      }
      getTrackEventObject(connectionId) {
          return {
              'mute': (ev) => {
                  this.emitEvent({
                      event: 'mute',
                      tag: 'track',
                      connectionId,
                      data: {
                          event: ev
                      }
                  });
              },
              'unmute': (ev) => {
                  this.emitEvent({
                      event: 'unmute',
                      tag: 'track',
                      connectionId,
                      data: {
                          event: ev
                      }
                  });
              },
              'overconstrained': (ev) => {
                  this.emitEvent({
                      event: 'overconstrained',
                      tag: 'track',
                      connectionId,
                      data: {
                          event: ev
                      }
                  });
              },
              'ended': (ev) => {
                  this.emitEvent({
                      event: 'ended',
                      tag: 'track',
                      connectionId,
                      data: {
                          event: ev
                      }
                  });
                  // no need to listen for events on this track anymore
                  this.removeTrackEventListeners(ev.target);
              }
          };
      }
      /**
       * Add event listeners for the tracks that are added to the stream
       * @param {MediaStreamTrack} track
       */
      addTrackEventListeners(track, connectionId) {
          eventListeners[track.id] = {};
          const events = this.getTrackEventObject(connectionId);
          Object.keys(events).forEach(eventName => {
              eventListeners[track.id][eventName] = events[eventName].bind(this);
              track.addEventListener(eventName, eventListeners[track.id][eventName]);
          });
          // check once per second if the track has been stopped
          // calling .stop() does not fire any events
          eventListeners[track.id]['readyState'] = setInterval(() => {
              if (track.readyState === 'ended') {
                  let event = new CustomEvent('ended', { detail: { check: 'readyState' } });
                  track.dispatchEvent(event);
              }
          }, 1000);
      }
      removeTrackEventListeners(track) {
          if (track.id in eventListeners) {
              const events = this.getTrackEventObject();
              Object.keys(events).forEach(eventName => {
                  track.removeEventListener(eventName, eventListeners[track.id][eventName]);
              });
              clearInterval(eventListeners[track.id]['readyState']);
              delete eventListeners[track.id];
          }
      }
      addToTimeline(event) {
          this.timeline.push(event);
          this.emit('timeline', event);
      }
      /**
       * Used to emit a custom event and also add it to the timeline
       * @param {String} eventName The name of the custome event: track, getUserMedia, stats, etc
       * @param {Object} options   The object tha will be sent with the event
       */
      emitEvent(event) {
          const ev = {
              ...event,
              timestamp: new Date()
          };
          // add event to timeline
          this.addToTimeline(ev);
          if (ev.tag) {
              // and emit this event
              this.emit(ev.tag, ev);
          }
      }
      /**
       * Sets the PeerConnection stats reporting interval.
       * @param interval
       *        Interval in milliseconds
       */
      set getStatsInterval(interval) {
          if (!Number.isInteger(interval)) {
              throw new Error(`getStatsInterval should be an integer, got: ${interval}`);
          }
          this._getStatsInterval = interval;
          // TODO to be tested
          // Reset restart the interval with new value
          if (this.monitoringSetInterval) {
              this.stopStatsMonitoring();
              this.startStatsMonitoring();
          }
      }
      /**
       * Used to return the number of monitored peers
       * @return {number} [description]
       */
      get numberOfMonitoredPeers() {
          return Object.keys(this.peersToMonitor).length;
      }
      removePeerConnectionEventListeners(connectionId, pc) {
          if (connectionId in eventListeners) {
              // remove all PeerConnection listeners
              Object.keys(this.peerConnectionListeners).forEach(eventName => {
                  pc.removeEventListener(eventName, eventListeners[connectionId][eventName], false);
              });
              // remove reference for this connection
              delete eventListeners[connectionId];
          }
          // also remove track listeners
          pc.getSenders().forEach(sender => {
              if (sender.track) {
                  this.removeTrackEventListeners(sender.track);
              }
          });
          pc.getReceivers().forEach(receiver => {
              if (receiver.track) {
                  this.removeTrackEventListeners(receiver.track);
              }
          });
      }
      /**
       * Used to get a now timestamp
       * @return {number}
       */
      getTimestamp() {
          return Date.now();
      }
      // TODO
      wrapGetDisplayMedia() {
          const self = this;
          // @ts-ignore
          if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
              // @ts-ignore
              const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
              const gdm = function () {
                  self.debug('navigator.mediaDevices.getDisplayMedia', null, arguments[0]);
                  return origGetDisplayMedia.apply(navigator.mediaDevices, arguments)
                      .then(function (stream) {
                      // self.debug('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream))
                      return stream;
                  }, function (err) {
                      self.debug('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name);
                      return Promise.reject(err);
                  });
              };
              // @ts-ignore
              navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices);
          }
      }
  }

  exports.WebRTCStats = WebRTCStats;

  Object.defineProperty(exports, '__esModule', { value: true });

})(this.window = this.window || {});
