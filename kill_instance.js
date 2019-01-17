

module.exports.kill = function(spawnedInstance, cb)
{
  var tries = 0;
  var maxTries = 3;

  if (isNaN(maxTries) === true)
  {
    maxTries = 3;
  }

  if (spawnedInstance != null)
  {
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
        cb(`The game instance is still not killed after ${maxTries} attempts.`, null);
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

  else cb("The instance is not running", null);
}
