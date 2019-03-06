
const rw = require("./reader_writer.js");
const isPortInUse = require("./check_port.js");

module.exports.kill = function(game, cb)
{
  (function killAttempt(game, attempts, maxAttempts, cb)
  {
    if (isNaN(maxAttempts) === true)
    {
      maxAttempts = 3;
    }

    if (game.instance != null)
    {
      //destroy all data streams before killing the instance
      if (game.instance.stderr != null)
      {
        game.instance.stderr.destroy();
      }

      if (game.instance.stdin != null)
      {
        game.instance.stdin.destroy();
      }

      if (game.instance.stdout != null)
      {
        game.instance.stdout.destroy();
      }

      game.instance.kill("SIGTERM");
    }

    setTimeout(function()
    {
      isPortInUse(game.port, function(returnVal)
      {
        if (returnVal === true || game.instance != null)
        {
          //max attempts reached, call back
          if (attempts >= maxAttempts)
          {
            if (game.instance == null)
            {
              rw.log("error", `${game.name}'s instance was terminated but the port is still in use after ${maxAttempts} attempts.`);
              cb(`The game instance was terminated, but the port is still in use. You might have to wait a bit.`);
            }

            else
            {
              rw.log("error", `${game.name}'s instance is still not killed after ${maxAttempts} attempts. exitCode is ${game.instance.exitCode}.`, {exitCode: game.instance.exitCode, instance: game.instance});
              cb(`The game instance could not be killed after ${maxAttempts}. It seems that the instance contained an error.`);
            }

            return;
          }

          else killAttempt(game, attempts++, maxAttempts, cb);
        }

        //All good
        else cb(null);
      });

    }, 3000);

  })(game, 0, 3, cb);
}

//The SIGKILL signal is the one that kills a process
/*if (process.platform === "linux")
{
  rw.log("general", 'Running on Linux, attempting the kill <pid> command...');
  const {spawn} = require('child_process');
  const kill = spawn('kill', [-game.instance.pid]);
  attempts = 999;

  kill.on("close", (code) =>
  {
    if (code === 0)
    {
      rw.log("general", `${game.name}'s instance was killed? Kill command closed with code ${code}.`);
    }

    else rw.log("error", `"kill" command closed with code ${code}; ${game.name}'s instance might not be terminated.`);
  });
}*/
