
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
    rw.logError({port: port, args: args, game: game.name, error: err}, `host error in the instance.on "error" event.`);
    socket.emit("gameError", {name: game.name, error: err});
  });

  //Event fires if the process is closed
  game.instance.on("close", (code, signal) =>
  {
    //unexpected termination of the game. If the property killed was not
    //set to true, it would mean that the kill was not intended?
    //A code that is not 0 means there was an error
    if (game.instance.killed === false /*&& code !== 0*/)
    {
      rw.logError({port: port, args: args, game: game.name, code: code, signal: signal}, `instance.on "close" event.`);
      socket.emit("gameClosedUnexpectedly", {name: game.name});
    }

    game.instance = null;
  });

  //will be null if anything was changed on calling the spawn function,
  //like {stdio: 'ignore'}
  if (game.instance.stderr != null)
  {
    //errors from the instance's stderr stream
    game.instance.stderr.on("data", (data) =>
    {
      game.instance = null;
      socket.emit("gameError", {name: game.name, error: data.toString()});
    });
  }


  cb(null);
};

function getAdditionalArgs(game)
{
  switch(game.gameType.toLowerCase().trim())
  {
    case "dom4":
    return ["--nosteam", "--statuspage", `${config.statusPageBasePath}/${game.name}_status`, ...backupCmd("--preexec", game.name), ...backupCmd("--postexec", game.name)];
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
