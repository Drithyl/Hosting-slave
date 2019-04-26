
const rw = require("./reader_writer.js");
const isPortInUse = require("./check_port.js");
const msBetweenAttempts = 5000;

module.exports.kill = function(game, cb)
{
  (function killAttempt(game, attempts, maxAttempts, cb)
  {
    rw.log("general", `Attempt ${attempts}. Max attempts ${maxAttempts}.`);

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

      //The SIGKILL signal is the one that kills a process
      if (process.platform === "linux")
      {
        rw.log("general", 'Running on Linux, attempting the domk bash /home/steam/bin/domk.sh ...');

        const {spawn} = require('child_process');
        const domk = spawn('/home/steam/bin/domk.sh', [game.port]/*, {shell: true}*/);

        domk.on("error", (err) =>
        {
          rw.log("error", "Error occurred when running domk: ", err);
        });

        domk.stdout.on('data', (data) => {
          rw.log("general", "domk stdout data: ", data);
        });

        domk.stderr.on('data', (data) => {
          rw.log("general", "domk stderr data: ", data);
        });

        domk.on("close", (code, signal) =>
        {
          rw.log("general", `domk script closed with code ${code} and signal ${signal}.`);
        });

        domk.on("exit", (code, signal) =>
        {
          rw.log("general", `domk script exited with code ${code} and signal ${signal}.`);
        });
      }

      else if (attempts === maxAttempts - 1)
      {
        game.instance.kill("SIGKILL");
      }

      else
      {
        game.instance.kill("SIGTERM");
      }
    }

    setTimeout(function()
    {
      rw.log("general", "Checking if port is still in use...");

      isPortInUse(game.port, function(returnVal)
      {
        rw.log("general", `isPortInUse returns ${returnVal}`);

        //All good
        if (returnVal === false && game.instance == null)
        {
          rw.log("general", "Port not in use, instance is null. Success.");
          cb(null);
          return;
        }

        rw.log("general", "Instance is not killed either.");
        //max attempts reached, call back
        if (attempts >= maxAttempts)
        {
          if (returnVal === false && game.instance != null)
          {
            rw.log("error", `${game.name}'s instance is still not killed after ${maxAttempts} attempts, but the port was freed up.`);
            cb(`The game instance could not be killed after ${maxAttempts}, but the port was preed up.`);
          }

          if (returnVal === true && game.instance == null)
          {
            rw.log("error", `${game.name}'s instance was terminated but the port is still in use after ${maxAttempts} attempts.`);
            cb(`The game instance was terminated, but the port is still in use. You might have to wait a bit.`);
          }

          else
          {
            rw.log("error", `${game.name}'s instance could not be terminated and the port is still in use after ${maxAttempts} attempts.`);
            cb(`The game instance could not be terminated and the port is still in use. You might have to wait a bit.`);
          }
        }

        else
        {
          killAttempt(game, ++attempts, maxAttempts, cb);
        }
      });

    }, msBetweenAttempts);

  })(game, 0, 3, cb);
}
