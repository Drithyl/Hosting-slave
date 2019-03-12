
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const timerParser = require("./timer_parser.js");
const kill = require("./kill_instance.js").kill;
const spawn = require("./process_spawn.js").spawn;

/************************************
*            GAME LIST              *
* {name, port, gameType, instance}  *
*     Indexed by port numbers       *
************************************/
//Create the file if it doesn't exist
if (fs.existsSync(config.gameDataSavePath) === false)
{
  rw.log("general", `Game Data file not found; creating a new one: ${config.gameDataSavePath}`);
  fs.writeFileSync(config.gameDataSavePath, "{}");
}

const games = require(config.gameDataSavePath);

//this will be used to set a delay between host requests
var gameHostRequests = [];
var dom4game = require("./dom4game.js").init(games);
var coe4game = require("./coe4game.js").init(games);
var dom5game = require("./dom5game.js").init(games);
var handlers = {};

//assign proper handlers to each game for when functions are called
for (var port in games)
{
  assignHandler(games[port], port);
}

module.exports.create = function(name, port, gameType, args, socket, cb)
{
  games[port] = {};
  games[port].port = port;
  games[port].name = name;
  games[port].args = args;
  games[port].gameType = gameType;
  assignHandler(games[port], port);
  saveGames(cb);
};

module.exports.getGame = function(port)
{
  return games[port];
};

module.exports.getGameNames = function()
{
  var gameNames = [];

  for (var port in games)
  {
    gameNames.push(games[port].name);
  }

  return gameNames;
};

module.exports.getUsedPorts = function()
{
  return Object.keys(games);
};

module.exports.isGameNameUsed = function(name, gameType)
{
  var savePath;

  for (var port in games)
  {
    if (name.toLowerCase() === games[port].name.toLowerCase())
    {
      return true;
    }
  }

  switch(gameType.toLowerCase().trim())
  {
    case "dom4":
    savePath = `${config.dom4DataPath}/savedgames/${name}`;
    break;

    case "dom5":
    savePath = `${config.dom5DataPath}/savedgames/${name}`;
    break;

    default:
    return true;
  }

  if (fs.existsSync(savePath) === true)
  {
    return true;
  }

  else return false;
}

module.exports.killGame = function(port, cb)
{
  kill(games[port], cb);
};

module.exports.nukeGame = function(port, cb)
{
  kill(games[port], function(err)
  {
    if (err)
    {
      games[port].instance = null;
      cb(null);
      return;
    }

    else cb(null);
  });
};

module.exports.freezeGames = function()
{
  Object.keys(games).forEachAsync(function(port, index, next)
  {
    let game = games[port];

    if (game == null)
    {
      rw.log("general", `Port key ${port} contains a null game.`);
      delete games[port];
      next();
    }

    else if (game.instance == null)
    {
      rw.log("general", `${game.name}'s instance is null; no need to freeze.`);
      next();
    }

    timerParser.getTimer(game.name, function(err, timer)
    {
      if (err)
      {
        rw.log("error", `${game.name}'s timer could not be parsed, cannot freeze.`);
        next();
        return;
      }

      if (timer.turn === 0)
      {
        rw.log("general", `${game.name}'s has not started. No need to freeze.`);
        next();
        return;
      }

      game.frozen = true;

      //pause timer
      timer.isPaused = true;
      handlers[port].call.changeCurrentTimer({port: port, timer: timer}, function()
      {
        next();
      });
    });
  });
}

module.exports.shutDownGames = function(cb)
{
  Object.keys(games).forEachAsync(function(port, index, next)
  {
    let game = games[port];

    if (game == null)
    {
      rw.log("general", `Port key ${port} contains a null game.`);
      delete games[port];
      next();
    }

    else if (game.instance == null)
    {
      rw.log("general", `${game.name}'s instance is already null.`);
      next();
    }

    else
    {
      rw.log("general", `Killing ${game.name}...`);

      kill(game, function(err)
      {
        next();
      });
    }

  }, cb);
};

module.exports.gameExists = function(port)
{
  if (games[port] == null)
  {
    return false;
  }

  else return true;
};

module.exports.isPortInUse = function(port)
{
  if (games[port] != null)
  {
    return true;
  }

  else return false;
};

module.exports.matchName = function(port, name)
{
  if (games[port].name === name)
  {
    return true;
  }

  else return false;
};

module.exports.getModList = function(gameType, cb)
{
  switch(gameType.toLowerCase())
  {
    case "dom4":
    dom4game.getModList(cb);
    break;

    case "dom5":
    dom5game.getModList(cb);
    break;

    default:
    cb(`${gameType} is not a valid game type. It should be either dom4 or dom5.`, null);
    break;
  }
};

module.exports.getMapList = function(gameType, cb)
{
  switch(gameType.toLowerCase())
  {
    case "dom4":
    dom4game.getMapList(cb);
    break;

    case "dom5":
    dom5game.getMapList(cb);
    break;

    default:
    cb(`${gameType} is not a valid game type. It should be either dom4 or dom5.`, null);
    break;
  }
};

module.exports.getTurnFile = function(data, cb)
{
  if (typeof handlers[data.port].call.getTurnFile !== "function")
  {
    cb("This game does not support this function.");
  }

  else handlers[data.port].call.getTurnFile(data, cb);
}

module.exports.getScoreDump = function(data, cb)
{
  if (typeof handlers[data.port].call.getScoreDump !== "function")
  {
    cb("This game does not support this function.");
  }

  else handlers[data.port].call.getScoreDump(data, cb);
}

module.exports.start = function(data, cb)
{
  handlers[data.port].call.start(data, cb);
};

module.exports.restart = function(data, cb)
{
  if (typeof handlers[data.port].call.restart !== "function")
  {
    cb("This game does not support this function.");
  }

  else handlers[data.port].call.restart(data, cb);
};

module.exports.backupSavefiles = function(data, cb)
{
  if (typeof handlers[data.port].call.backupSavefiles !== "function")
  {
    cb("This game does not support this function.");
  }

  else handlers[data.port].call.backupSavefiles(data, cb);
};

module.exports.rollback = function(data, cb)
{
  if (typeof handlers[data.port].call.rollback !== "function")
  {
    cb("This game does not support this function.");
  }

  else handlers[data.port].call.rollback(data, cb);
};

module.exports.requestHosting = function(port, args, socket, cb)
{
  let game = games[port];

  if (game.instance != null && game.frozen === true)
  {
    handlers[port].call.changeCurrentTimer({port: port, timer: args}, function(err)
    {
      if (err)
      {
        rw.log("error", `An error occurred when changing the current timer of the frozen game ${game.name}.`);
        cb(`An error occurred when changing the current timer of the frozen game ${game.name}.`);
      }

      else cb();
    });
  }

  else if (game.instance != null)
  {
    rw.log("general", `The game ${game.name}'s instance is not null; cannot host over it.`);
    cb();
  }

  else
  {
    gameHostRequests.push(port);

    //if null args, use defaults
    if (args == null)
    {
      args = games[port].args;
    }

    //sets a delay so that when many host requests are received, the server
    //does not get overloaded
    setTimeout(function()
    {
      gameHostRequests.splice(gameHostRequests.indexOf(port), 1);
      spawn(port, args, games[port], cb);

    }, config.gameHostMsDelay * gameHostRequests.length);
  }
};

module.exports.isGameRunning = function(port)
{
  if (games[port] != null && games[port].instance != null && games[port].instance.killed === false)
  {
    return true;
  }

  else return false;
}

module.exports.changeCurrentTimer = function(data, cb)
{
  handlers[data.port].call.changeCurrentTimer(data, cb);
};

module.exports.changeDefaultTimer = function(data, cb)
{
  handlers[data.port].call.changeDefaultTimer(data, cb);
};

module.exports.getSubmittedPretenders = function(data, cb)
{
  if (typeof handlers[data.port].call.removePretender !== "function")
  {
    cb("This game does not support the getSubmittedPretenders function.");
  }

  else handlers[data.port].call.getSubmittedPretenders(data, cb);
};

module.exports.removePretender = function(data, cb)
{
  if (typeof handlers[data.port].call.removePretender !== "function")
  {
    cb("This game does not support the removePretender function.");
  }

  else handlers[data.port].call.removePretender(data, cb);
};

module.exports.getStales = function(data, cb)
{
  if (typeof handlers[data.port].call.getStales !== "function")
  {
    cb("This game does not support the getStales function.");
  }

  else handlers[data.port].call.getStales(data, cb);
};

module.exports.getTurnInfo = function(data, cb)
{
  var game = games[data.port];

  timerParser.getTimer(game.name, function(err, timer)
  {
    if (err)
    {
      rw.log("error", `An error occurred when getting ${game.name}'s timer info: `, err);
      cb(`An error occurred when getting ${game.name}'s timer info.`);
      return;
    }

    cb(null, timer);
  });
};

module.exports.getDump = function(data, cb)
{
  if (typeof handlers[data.port].call.getDump !== "function")
  {
    cb("This game does not support the getDump function.");
  }

  else handlers[data.port].call.getDump(data, cb);
};

module.exports.getLastHostedTime = function(data, cb)
{
  if (typeof handlers[data.port].call.getLastHostedTime !== "function")
  {
    cb("This game does not support the getLastHostedTime function.");
  }

  else handlers[data.port].call.getLastHostedTime(data, cb);
};

module.exports.deleteGameSavefiles = function(data, cb)
{
  kill(games[port], function(err)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    handlers[data.port].call.deleteGameSavefiles(data, cb);
  });
};

module.exports.deleteGameData = function(port, cb)
{
  kill(games[port], function(err)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    delete games[port];
    delete handlers[port];
    saveGames(cb);
  });
};

module.exports.saveSettings = function(data, cb)
{
  let game = games[data.port];
  game.args = data.args;
  saveGames(cb);
}

function saveGames(cb)
{
  var data = gamesToJSON();

  rw.log("general", "Saving games' data:");
  fs.writeFile(config.gameDataSavePath, data, function(err)
  {
    if (err)
    {
      rw.logError({games: data}, `fs.writeFile Error:`, err);
      cb(`An error occurred when trying to save the game data:\n\n${err}`, null);
      return;
    }

    cb(null);
    rw.log("general", "Data saved.");
  });
};

function gamesToJSON(spacing = 2)
{
  var clonedGames = {};

  for (var port in games)
  {
    clonedGames[port] = {};

    for (var key in games[port])
    {
      if (key.toLowerCase() !== "instance")
      {
        clonedGames[port][key] = games[port][key];
      }
    }
  }

  return JSON.stringify(clonedGames, null, 2);
}

//assigns the proper host class for the gameType, for all future function
//calls related
function assignHandler(game, port)
{
  switch(game.gameType.toLowerCase().trim())
  {
    case "dom4":
    handlers[port] = {name: game.name, call: dom4game};
    break;

    case "dom5":
    handlers[port] = {name: game.name, call: dom5game};
    break;

    case "coe4":
    handlers[port] = {name: game.name, call: coe4game};
    break;

    default:
    rw.logError({name: game.name, gameType: game.gameType}, `Incorrect game type, cannot assign a handler.`);
    throw `The game ${game.name} has an incorrect game type, cannot assign a handler: ${game.gameType}.`;
  }
}
