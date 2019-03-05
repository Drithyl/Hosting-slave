
const rw = require("./reader_writer.js");

module.exports.kill = function(game, cb)
{
  var tries = 0;
  var maxTries = 3;

  if (isNaN(maxTries) === true)
  {
    maxTries = 3;
  }

  if (game.instance == null || game.instance.killed === true)
  {
    game.instance = null;
    cb(null);
    return;
  }

  (function killAttempt()
  {
    //The signal SIGKILL seems to set the flag .killed to true
    //in instances even before they are terminated, so it's a valid check
    if (game.instance == null || game.instance.killed === true)
    {
      //success
      game.instance = null;
      cb(null);
      return;
    }

    if (tries > maxTries)
    {
      //if an exitCode exists and it is not 0, it is likely that this instance was bugged,
      //and was not working properly in the first place
      if (game.instance.exitCode != null && game.instance.exitCode !== 0)
      {
        rw.logError({exitCode: game.instance.exitCode, instance: game.instance}, `${game.name}'s instance is still not killed after ${maxTries} attempts. exitCode is ${game.instance.exitCode}.`);
        game.instance = null;
        cb(`${game.name}'s instance is still not killed after ${maxTries} attempts. It seems that the instance contained an error.`, null);
      }

      else
      {
        rw.logError({instance: game.instance}, `${game.name}'s instance is still not killed after ${maxTries} attempts.`);
        cb(`${game.name}'s instance is still not killed after ${maxTries} attempts.`, null);
      }

      return;
    }

    tries++;

    //stdin must be paused for a node instance to exit
    if (game.instance.stdin != null)
    {
      game.instance.stdin.pause();
    }

    //The SIGKILL signal is the one that kills a process
    game.instance.kill("SIGKILL");
    setTimeout(killAttempt, 600);
  })();
}
