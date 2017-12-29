// Required modules
const irc = require('irc');
const logger = require('./logger.js');

// Exports
module.exports = {
  invalidConfig: function(config) {
    return !(('host' in config) && ('nick' in config));
  },
  connectOpts: function(opts, callback_msg) {
    // TODO: sanity check on opts
    var client = new irc.Client(opts.host, opts.nick, opts);
    client.addListener('error', function(msg) {logger.error(opts.name + ': ' + msg)});
    client.addListener('registered', function(msg) {
      // nickserv auth
      if ('nickserv' in opts) {
        client.say('NickServ', opts.nickserv);
      }
    });
    client.addListener('message#', function(nick, to, text, message) {
      callback_msg(text, {server: opts.name, channel: to, user: nick});
    });
    return client;
  },
  kill: function(connection) {
    connection.disconnect('Goodbye!');
  }
};
