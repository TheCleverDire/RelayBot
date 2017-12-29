// Required modules
const chalk = require('chalk');

module.exports = {
  info: function(str) {
    console.log('[' + chalk.blue('INFO') + '] ' + str);
  },
  warn: function(str) {
    console.log('[' + chalk.yellow('WARN') + '] ' + str);
  },
  error: function(str) {
    console.log('[' + chalk.red('ERR!') + '] ' + str);
  },
  fatal: function(str) {
    console.log('[' + chalk.redBright('FATL') + '] ' + str);
  },
  happy: function(str) {
    console.log('[' + chalk.green('INFO') + '] ' + str);
  },
};
