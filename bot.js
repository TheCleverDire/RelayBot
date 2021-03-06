// required modules
const irc = require('./irchelper.js');
const fs = require('fs');
const logger = require('./logger.js');

// version info
const version = 'v1.0.0';
const CONFIG_FILE = 'config.json';

// global variables
var config = {};
var irc_conns = {};
var updateMonitor;

// code entry point main()
logger.info('RelayBot ' + version + ' starting up!');

// read initial file
fs.readFile(CONFIG_FILE, updateConfig);

// watch for changes
fs.watch(CONFIG_FILE, (eventType, filename) => {
  if (eventType != 'change' || filename != CONFIG_FILE) {
    logger.warn('Ignoring `' + eventType + '` for `' + filename + '`');
  }
  // sometimes a duplicate event will be triggered within 100ms, so don't catch
  // both
  if (updateMonitor) clearTimeout(updateMonitor);
  updateMonitor = setTimeout(function() {
    fs.readFile(CONFIG_FILE, updateConfig);
  }, 100);
});

// code that is called when the config gets updated
function updateConfig(error, data) {
  if (error) {
    logger.error("Failed to update config: "+ error);
    return;
  }

  logger.info('Attemping to parse updated config');
  //try {
    var config_new = JSON.parse(data);

    // update irc connections
    var irc_conns_new = {};
    for (var i = 0; i < config_new.bot.connections.length; i++) {
      if (config_new.bot.connections[i].name in irc_conns_new) {
        throw new Error('Duplicate server name `' + config_new.bot.connections[i].name + '` in configuration');
      }
      irc_conns_new[config_new.bot.connections[i].name] = config_new.bot.connections[i];
    }

    // now we do a diff between old and new and see differences in irc connections
    var irc_conns_new_keys = Object.keys(irc_conns_new).sort();
    var irc_conns_keys = Object.keys(irc_conns).sort();

    // first the gained keys
    var queued_connections = [];
    for (var i = 0; i < irc_conns_new_keys.length; i++) {
      // new one was found in the array
      if (irc_conns_keys.indexOf(irc_conns_new_keys[i]) < 0) {
        // do some basic verification
        if (irc.invalidConfig(irc_conns_new[irc_conns_new_keys[i]])) {
          throw new Error('Invalid configuration for server `' + irc_conns_new_keys[i] + '`');
        }
        // queue a connection to the server
        queued_connections.push(irc_conns_new[irc_conns_new_keys[i]]);
      } else {
        // diff the channels
        var channels_new = irc_conns_new[irc_conns_new_keys[i]].channels.sort();
        var channels_old = irc_conns[irc_conns_keys[i]].channels.sort();

        // first the gained channels
        for (var j = 0; j < channels_new.length; j++) {
          // new one was found in array
          if (channels_old.indexOf(channels_new[j]) < 0) {
            logger.info('Joining channel ' + channels_new[j] + ' on IRC network ' + irc_conns_new_keys[i]);
            irc_conns[irc_conns_keys[i]].connection.join(channels_new[j]);
            irc_conns[irc_conns_keys[i]].channels.push(channels_new[j]);
          }
        }

        // now the removed channels
        for (var j = 0; j < channels_old.length; j++) {
          // old one was lost
          if (channels_new.indexOf(channels_old[j]) < 0) {
            logger.info('Parting channel ' + channels_old[j] + ' on IRC network ' + irc_conns_new_keys[i]);
            irc_conns[irc_conns_keys[i]].connection.part(channels_old[j], 'Goodbye!');
            irc_conns[irc_conns_keys[i]].channels = 
            irc_conns[irc_conns_keys[i]].channels.filter(e => e !== channels_old[j]);
          }
        }
      }
    }

    // now the lost keys
    var queued_disconnects = [];
    for (var i = 0; i < irc_conns_keys.length; i++) {
      // the new config is missing a server that the old one had
      if (irc_conns_new_keys.indexOf(irc_conns_keys[i]) < 0) {
        queued_disconnects.push({c: irc_conns[irc_conns_keys[i]].connection, n: irc_conns_keys[i]});
      }
    }

    // POINT OF NO ERROR ----- PAST THIS POINT, ERRORS ARE NO LONGER GOING TO
    // FAIL NICELY. IF AN ERROR OCCURS, THE APPLICATION IS RENDERED IN AN
    // UNSTABLE STATE. VERIFY ALL DATA BEFORE THIS POINT TO PREVENT ISSUES!

    // now do the actual connecting/disconnecting
    for (var i = 0; i < queued_disconnects.length; i++) {
      logger.info('Disconnected from IRC network ' + queued_disconnects[i].n);
      irc.kill(queued_disconnects[i].c);
      // delete the old stuff
      delete irc_conns[queued_disconnects[i].n];
    }
    for (var i = 0; i < queued_connections.length; i++) {
      var conn = queued_connections[i];
      logger.info('Connecting to IRC network ' + conn.name);
      irc_conns_new[conn.name].connection = irc.connectOpts(conn, broadcast_message);
      // make a copy to the new stuff
      irc_conns[conn.name] = irc_conns_new[conn.name];
    }

    logger.info('Updated config');
    config = config_new;
  //} catch (e) {
  //  logger.error('Failed to parse updated config: ' + e);
  //}
}

function noping(str) {
  // insert zero width space to prevent pings (allow custom configuration of what to insert)
  return str.substring(0, 3) + (config.bot.no_ping == true ? '\u200B' : config.bot.no_ping) + str.substring(3, str.length);
}

// code that is called to broadcast a message
function broadcast_message(msg, src) {
  if (!src) {
    src = {server: "Broadcast", channel: "All", user: "Admin"};
    msg = '[Broadcast] ' + msg;
  } else {
    var user = src.user;
    var channel = src.channel;
    if ('no_ping' in config.bot && config.bot.no_ping) {
      user = noping(user);
      channel = noping(channel);
    }
    msg = '[' + src.server + '' + channel + '] <' + user + '> ' + msg;
  }

  for (var conn_key in irc_conns) {
    if (!irc_conns.hasOwnProperty(conn_key)) continue;
    for (var j = 0; j < irc_conns[conn_key].channels.length; j++) {
      // skip sending message to self
      if (conn_key == src.server && irc_conns[conn_key].channels[j] == src.channel) continue;

      try {
        irc_conns[conn_key].connection.say(irc_conns[conn_key].channels[j], msg);
      } catch (e) {
        logger.warn('Failed to broadcast to IRC network ' + conn_key + ': ' + e);
      }
    }
  }
}
