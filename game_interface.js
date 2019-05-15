
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const timerParser = require("./timer_parser.js");
const kill = require("./kill_instance.js");
const spawn = require("./process_spawn.js").spawn;

/************************************************************
*                         GAME LIST                         *
*             {name, port, gameType, instance}              *
*     Indexed by port numbers, received from master server  *
************************************************************/
var games;

//this will be used to set a delay between host requests
var gameHostRequests = [];
var dom4game;
var coe4game;
var dom5game;
var handlers = {};

module.exports.init = function(gamesInfo)
{
  //this will happen when the slave server has been running after the master server
  //goes down and reconnects
  if (games != null)
  {
    for (var port in gamesInfo)
    {
      if (games[port] == null)
      {
        rw.log("error", `New data received on game ${gamesInfo[port].name} with port ${port} does not exist here.`);
        games[port] = gameReceived;
      }

      if (gamesInfo[port].name !== games[port].name)
      {
        rw.log("error", `New data received with port ${port} and name ${gamesInfo[port].name} does not match the game ${games[port].name} with the same port.`);
      }

      if (gamesInfo[port].frozenTimer != null)
      {
        delete gamesInfo[port].frozenTimer;
      }

      if (gamesInfo[port].instance != null)
      {
        delete gamesInfo[port].instance;
      }

      //merge new information with the one we have (this should keep .frozenTimer and .instance properties)
      Object.assign(games[port], gamesInfo[port]);
    }
  }

  //first initialization
  else games = gamesInfo;

  dom4game = require("./dom4game.js").init(games);
  coe4game = require("./coe4game.js").init(games);
  dom5game = require("./dom5game.js").init(games);

  //assign proper handlers to each game for when functions are called
  for (var port in games)
  {
    assignHandler(games[port], port);
  }
}

module.exports.create = function(name, port, gameType, args, cb)
{
  games[port] = {};
  games[port].port = port;
  games[port].name = name;
  games[port].args = args;
  games[port].gameType = gameType;
  assignHandler(games[port], port);
  cb();
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

      //check not only timer but also ftherlnd file, as an undeleted statuspage file
      //after a game was restarted could give unreliable timer values, and if the timer
      //is changed on a game that's sitting in the lobby, it'll begin a countdown to start
      if (timer == null || timer.turn == null || timer.turn === 0 ||
          fs.existsSync(`${config.dom5DataPath}/savedgames/${game.name}/ftherlnd`) === false)
      {
        rw.log("general", `${game.name}'s has not started. No need to freeze.`);
        next();
        return;
      }

      rw.log("general", `Freezing ${game.name}'s timer...`);
      game.frozenTimer = timerParser.getTotalSeconds(timer);

      //pause timer
      timer.isPaused = true;
      timer.days = 0;
      timer.hours = 0;
      timer.minutes = 0;
      timer.seconds = 0;

      if (typeof handlers[port].call.changeDefaultTimer === "function")
      {
        //change the default timer if available, otherwise if a new turn happens while
        //the bot is down the timer will no longer be frozen and will tick
        //down without any announcements having been made. changeDefaultTimer
        //will also change the current timer if no currentTimer option is provided
        handlers[port].call.changeDefaultTimer({port: port, timer: timer}, function(err)
        {
          if (err)
          {
            rw.log("error", `${game.name}'s default timer could not be frozen: ${err}`);
          }

          else rw.log("general", `${game.name}'s default timer frozen.`);

          next();
        });
      }

      else
      {
        handlers[port].call.changeCurrentTimer({port: port, timer: timer}, function(err)
        {
          if (err)
          {
            rw.log("error", `${game.name}'s current timer could not be frozen: ${err}`);
          }

          else rw.log("general", `${game.name}'s current timer frozen.`);

          next();
        });
      }
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
  if (games[port].name.toLowerCase() === name.toLowerCase())
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

module.exports.requestHosting = function(port, args, cb)
{
  let game = games[port];

  if (game.instance != null && game.frozenTimer != null)
  {
    rw.log("general", `Restoring ${game.name}'s frozen timer...`);
    handlers[port].call.changeCurrentTimer({port: port, timer: game.frozenTimer}, function(err)
    {
      if (err)
      {
        rw.log("error", `An error occurred when changing the current timer of the frozen game ${game.name}.`);
        cb(`An error occurred when changing the current timer of the frozen game ${game.name}.`);
      }

      else
      {
        rw.log("general", `${game.name}'s timer restored.`);
        cb();
      }
    });
  }

  else if (game.instance != null)
  {
    rw.log("general", `The game ${game.name}'s instance is already running.`);
    cb();
  }

  else
  {
    rw.log("general", `Requesting hosting for ${game.name}...`);
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
  if (typeof handlers[data.port].call.getSubmittedPretenders !== "function")
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
  kill(games[data.port], function(err)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    handlers[data.port].call.deleteGameSavefiles(data, cb);
  });
};

module.exports.deleteGameData = function(data, cb)
{
  kill(games[data.port], function(err)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    delete games[data.port];
    delete handlers[data.port];
    cb();
  });
};

module.exports.saveSettings = function(data, cb)
{
  let game = games[data.port];
  game.args = data.args;
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
