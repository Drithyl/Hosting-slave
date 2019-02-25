
const rw = require("./reader_writer.js");

module.exports.kill = function(spawnedInstance, cb)
{
  var tries = 0;
  var maxTries = 3;

  if (isNaN(maxTries) === true)
  {
    maxTries = 3;
  }

  if (spawnedInstance == null || spawnedInstance.killed === true)
  {
    cb(null);
    return;
  }

  (function killAttempt()
  {
    //The signal SIGKILL seems to set the flag .killed to true
    //in instances even before they are terminated, so it's a valid check
    if (spawnedInstance == null || spawnedInstance.killed === true)
    {
      //success
      cb(null);
      return;
    }

    if (tries > maxTries)
    {
      //if an exitCode exists and it is not 0, it is likely that this instance was bugged,
      //and was not working properly in the first place
      if (spawnedInstance.exitCode != null && spawnedInstance.exitCode !== 0)
      {
        rw.logError({exitCode: spawnedInstance.exitCode, instance: spawnedInstance}, `The game instance is still not killed after ${maxTries} attempts. It seems that the instance contained an error.`);
        cb(`The game instance is still not killed after ${maxTries} attempts. It seems that the instance contained an error.`, null);
      }

      else
      {
        rw.logError({instance: spawnedInstance}, `The game instance is still not killed after ${maxTries} attempts.`);
        cb(`The game instance is still not killed after ${maxTries} attempts.`, null);
      }

      return;
    }

    tries++;

    //stdin must be paused for a node instance to exit
    if (spawnedInstance.stdin != null)
    {
      spawnedInstance.stdin.pause();
    }

    //The SIGKILL signal is the one that kills a process
    spawnedInstance.kill("SIGKILL");
    setTimeout(killAttempt, 600);
  })();
}
