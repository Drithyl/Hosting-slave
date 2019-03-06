
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const spawn = require('child_process').spawn;
var socket;

module.exports.init = function(activeSocket)
{
  socket = activeSocket;
  return this;
}

//BEWARE: do not try to pass a master server callback directly to the function or
//the returning instance will cause a RangeError: Maximum call stack size exceeded
//as it is an object that contains circular references
module.exports.spawn = function(port, args, game, cb)
{
  let path;

  try
  {
    path = getExePath(game.gameType);
  }

  catch(err)
  {
    cb(err);
  }

  if (fs.existsSync(path) === false)
  {
    cb(`The path ${path} is incorrect. Cannot host game ${game.name} (${game.gameType}).`);
    return;
  }

  if (args == null)
  {
    cb(`No args were provided to host the game ${game.name} (${game.gameType}).`);
    return;
  }

  try
  {
    args = args.concat(getAdditionalArgs(game));
  }

  catch(err)
  {
    cb(err);
    return;
  }

  //instances get overloaded if they spent ~24h with their stdio being listened to,
  //and end up freezing (in windows server 2012), according to tests in previous bot versions
  //TODO: testing not ignoring the stdio again
	game.instance = spawn(path, args/*, {stdio: 'ignore'}*/);
  rw.log("general", `Process for ${game.name} spawned.`);

  //The process could not be spawned, or
  //the process could not be killed
  //Sometimes an instance will get spawned with an error occurring, but will still be live
  game.instance.on("error", (err) =>
  {
    game.instance = null;
    rw.log("error", `${game.name}'s "error" event triggered.`, {port: port, args: args, error: err});
    socket.emit("gameError", {name: game.name, error: err});
  });

  //Fires when the process itself exits. See https://nodejs.org/api/child_process.html#child_process_event_exit
  game.instance.on("exit", (code, signal) =>
  {
    //If process exited, code is its final code and signal is null;
    //if it was terminated due to a signal, then code is null.
    if (signal === "SIGKILL")
    {
      rw.log(["general"], `${game.name}'s was terminated by SIGKILL.`);
    }

    else if (code === 0)
    {
      rw.log(["general"], `${game.name}'s exited without errors (perhaps port was already in use).`);
    }

    else if (signal == null)
    {
      rw.log(["error"], `${game.name}'s "exit" event triggered. Maybe an ingame error occurred, or an arg made it crash. Try launching it without the --notext flag:\n`, {port: port, args: args, code: code, signal: signal});
      socket.emit("gameExited", {name: game.name, code: code});
    }

    //SIGKILL would mean that the kill_instance.js code was called, so it's as expected
    else if (game.instance.killed === false && signal !== "SIGKILL")
    {
      rw.log(["error"], `${game.name}'s "exit" event triggered. Process was abnormally terminated:\n`, {port: port, args: args, code: code, signal: signal});
      socket.emit("gameTerminated", {name: game.name, signal: signal});
    }

    game.instance = null;
  });

  //Event fires if the stdio streams are closed (which might be *before* or *after* the actual
  //process exits. See https://nodejs.org/api/child_process.html#child_process_event_close and
  //https://stackoverflow.com/questions/37522010/difference-between-childprocess-close-exit-events)
  game.instance.on("close", (code, signal) =>
  {
    if (signal === "SIGKILL")
    {
      rw.log(["general"], `${game.name}'s stdio got closed by SIGKILL.`);
    }

    else if (code === 0)
    {
      rw.log(["general"], `${game.name}'s stdio got closed with code 0.`);
    }

    //code 0 means there were no errors. If instance is null, then "exit" above
    //must have run already, so don't ping the master server again
    if (game.instance != null && game.instance.killed === false && code !== 0)
    {
      socket.emit("stdioClosed", {name: game.name, code: code, signal: signal});
      rw.log(["general"], `${game.name}'s stdio closed:\n`, {port: port, args: args, code: code, signal: signal});
    }
  });

  //will be null if stdio was changed on calling the spawn function,
  //like {stdio: 'ignore'}
  if (game.instance.stderr != null)
  {
    game.instance.stderr.setEncoding("utf8");

    //data from the instance's stderr stream
    game.instance.stderr.on("data", (data) =>
    {
      rw.log(["general"], `${game.name}'s stderr "data" event triggered:\n`, data);
      socket.emit("stderrData", {name: game.name, data: data});
    });

    //errors from the instance's stderr stream
    game.instance.stderr.on("error", (err) =>
    {
      rw.log(["error"], `${game.name}'s stderr "error" event triggered:\n`, {port: port, args: args, error: err});
      socket.emit("stderrError", {name: game.name, error: err});
    });
  }

  if (game.instance.stdin != null)
  {
    game.instance.stdin.on('error', function (err)
    {
      rw.log(["error"], `${game.name}'s stdin "error" event triggered:\n`, {port: port, args: args, error: err});
      socket.emit("stdinError", {name: game.name, error: err});
    });
  }

  if (game.instance.stdout != null)
  {
    game.instance.stdout.setEncoding("utf8");
    /*game.instance.stdout.on('data', function (data)
    {
      rw.log(["general"], `${game.name}'s stdout "data" event triggered:\n`, {data: data});
      socket.emit("stdoutData", {name: game.name, data: data});
    });*/

    game.instance.stdout.on('error', function (err)
    {
      rw.log(["error"], `${game.name}'s stdout "error" event triggered:\n`, {port: port, args: args, error: err});
      socket.emit("stdoutError", {name: game.name, error: err});
    });
  }

  cb(null);
};

function getAdditionalArgs(game)
{
  switch(game.gameType.toLowerCase().trim())
  {
    case "dom4":
    return ["--statuspage", `${config.statusPageBasePath}/${game.name}_status`, ...backupCmd("--preexec", game.name), ...backupCmd("--postexec", game.name)];
    break;

    case "dom5":
    return ["--nosteam", "--statuspage", `${config.statusPageBasePath}/${game.name}_status`, ...backupCmd("--preexec", game.name), ...backupCmd("--postexec", game.name)];
    break;

    case "coe4":
    return [];
    break;

    default:
    rw.logError({name: game.name, gameType: game.gameType}, `The game ${game.name} has an incorrect game type, cannot add required args: ${game.gameType}.`);
    throw `The game ${game.name} has an incorrect game type, cannot add required args: ${game.gameType}.`;
  }
}

function getExePath(gameType)
{
  switch(gameType.toLowerCase().trim())
  {
    case "dom4":
    return config.dom4ExePath;
    break;

    case "dom5":
    return config.dom5ExePath;
    break;

    case "coe4":
    return config.coe4ExePath;
    break;

    default:
    rw.logError({name: game.name, gameType: game.gameType}, `The game ${game.name} has an incorrect game type, cannot get exe path: ${game.gameType}.`);
    throw `The game ${game.name} has an incorrect game type, cannot get exe path: ${game.gameType}.`;
  }
}

function backupCmd(type, gameName)
{
  let backupModulePath = require.resolve("./backup_script.js");

  if (typeof backupModulePath !== "string")
  {
    return [];
  }

  else return [type, `node "${backupModulePath}" ${gameName} ${type}`];
}
