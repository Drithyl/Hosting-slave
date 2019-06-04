
const fs = require("fs");
const spawn = require("./process_spawn.js").spawn;
const kill = require("./kill_instance.js");
const rw = require("./reader_writer.js");
const config = require("./config.json");
const provCountFn = require("./province_count_module.js");
var games;

module.exports.init = function(gameList)
{
  games = gameList;
  return this;
};

module.exports.getModList = function(cb)
{
  rw.getDirFilenames(config.dom4DataPath + "/mods", ".dm", function(err, filenames)
  {
    if (err)
    {
      cb(err, null);
    }

    else cb(null, filenames);
  });
};

module.exports.getMapList = function(cb)
{
  let provCountList = [];

  rw.readDirContent(config.dom4DataPath + "/maps", ".map", function(err, list)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    list.forEach((file) =>
    {
      let provs = provCountFn(file.content);

      if (provs != null)
      {
        provCountList.push({name: file.filename, ...provs});
      }
    });

    cb(null, provCountList);
  });
};

module.exports.start = function(data, cb)
{
  kill(games[data.port], function(err)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    //host
    spawn(data.port, data.args, games[data.port], function(err)
    {
      if (err)
      {
        cb(`An error occurred when trying to rehost the game to start it.`);
      }

      else cb(null);
    });
  });
}

module.exports.restart = function(data, cb)
{
  var game = games[data.port];
  var path = `${config.dom4DataPath}/savedgames/${game.name}`;

  rw.log("general", `Killing ${game.name}'s process...`);

  //kill game first so it doesn't automatically regenerate the statuspage file
  //as soon as it gets deleted
  kill(game, function(err)
  {
    if (err)
    {
      return cb(`The game's process could not be killed to do the necessary changes to restart it.`);
    }

    rw.log("general", `Checking for existing ${game.name}'s statuspage file...`);

    //if statuspage exists, it *must* be deleted, or else every timer check done before
    //the game starts again will return unreliable values which could have undesirable
    //side-effects (like if the bot goes down, it will freeze the game's timer and
    //then restore it later, causing an unrequested countdown to start, because the
    //old statuspage made it seem like the game was started)
    if (fs.existsSync(`${config.statusPageBasePath}/${game.name}_status`) === true)
    {
      try
      {
        fs.unlinkSync(`${config.statusPageBasePath}/${game.name}_status`);
        rw.log("general", `${game.name}'s statuspage file has been deleted.`);
      }

      catch(err)
      {
        rw.log("error", `${game.name}'s statuspage file could not be deleted:\n\n${err.message}`);
        return cb(`Dominions' statuspage could not be deleted. The game was not restarted but its process was shut down.`);
      }
    }

    rw.log("general", `Starting the atomic removal of savedgame files...`);

    //must delete statusdump.txt as well, otherwise when players type
    //!pretenders, it will read the old statusdump file and show existing
    //pretenders that have been deleted. atomicRmDir guarantees that either
    //all the necessary files get deleted or none of them does, thus
    //preserving the integrity of the savedgames folder. The "" in the filter
    //is necessary as the fthrlnd file that contains the main data has no extension
    rw.atomicRmDir(path, ["", ".2h", ".trn", ".txt"], function(err)
    {
      if (err)
      {
        rw.log("error", `Failed to remove savedgame files:\n\n${err.message}`);
        return cb(`Error when deleting save files. The game has not been restarted and is simply shut down. You can relaunch its process normally. Below is the error message:\n\n${err.message}`);
      }

      rw.log("general", `Removed files successfully. Spawning game's process...`);

      spawn(game.port, game.args, game, function(err)
      {
        if (err)
        {
          cb(`The data was restarted, but the game's process could not be launched after killing it. Try to use the launch command to do so manually.`);
        }

        else cb();
      });
    });
  });
};

module.exports.changeCurrentTimer = function(data, cb)
{
  rw.log("general", `Attempting to kill ${games[data.port].name} to change current timer...`);
  kill(games[data.port], function(err)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    spawn(data.port, games[data.port].args.concat(data.timer), games[data.port], function(err)
    {
      if (err)
      {
        cb(`An error occurred when trying to rehost ${games[data.port].name} to change the current timer.`);
        return;
      }

      else cb(null);
    });
  });
};

module.exports.getStales = function(data, cb)
{
  var staleCount = 0;
  var staleArray = [];
  var game = games[data.port];
  var files = fs.readdirSync(`${config.dom4DataPath}/savedgames/${game.name}`, "utf8");

  if (files == null)
  {
    cb(`An error occurred while reading the save files of ${game.name} to check stales.`);
    return;
  }

  files.forEach(function(file)
  {
    //Only check the files with the .2h extension
		if (file.slice(file.indexOf(".")) == ".2h")
		{
			var stats = fs.statSync(`${config.dom4DataPath}/savedgames/${game.name}/${file}`);

			if (stats == null)
			{
        rw.logError({Game: game.name, file: file, data: data}, `File stats is null.`);
				cb(`An error occurred while checking the stats of the file ${file} for stales for the game ${game.name}.`);
				return;
			}

			if (stats.mtime.getTime() < data.lastHostedTime)
			{
        staleArray.push(file);
			}
		}
  });

  cb(null, staleArray);
};

module.exports.getLastHostedTime = function(data, cb)
{
  fs.stat(config.dom4DataPath + "/savedgames/" + games[data.port].name + "/ftherlnd", function(err, stats)
  {
    if (err)
    {
      cb(err, null);
    }

    else cb(null, stats.mtime.getTime());
  });
};

module.exports.deleteGameSavefiles = function(data, cb)
{
  var game = games[data.port];
  var path = config.dom4DataPath + "/savedgames/" + game.name;

  fs.readdir(path, function(err, files)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    files.forEach(function(file)
    {
      fs.unlinkSync(path + "/" + file);
    });

    fs.rmdirSync(path);
    cb(null, `${game.name}: deleted the dom save files.`);
  });
};

module.exports.backupSavefiles = function(data, cb)
{
  var game = games[data.port];
  var source = `${config.dom4DataPath}/savedgames/${game.name}`;
  var target = `${config.pathToGameSaveBackup}/`;

  if (data.isNewTurn === true)
  {
    target += `${config.newTurnsBackupDirName}/${game.name}/Turn ${data.turnNbr}`;
  }

  else target += `${config.latestTurnBackupDirName}/${game.name}/Turn ${data.turnNbr}`;

  rw.copyDir(source, target, false, ["", ".2h", ".trn"], cb);
};

//requires the default timer to be sent in the data,
//to adjust it after rollbacking
module.exports.rollback = function(data, cb)
{
  var game = games[data.port];
  var source = `${config.pathToGameSaveBackup}/${config.latestTurnBackupDirName}/${game.name}/Turn ${data.turnNbr}`;
  var target = `${config.dom4DataPath}/savedgames/${game.name}`;

  if (fs.existsSync(source) === false)
  {
    source = `${config.pathToGameSaveBackup}/${config.newTurnsBackupDirName}/${game.name}/Turn ${data.turnNbr}`;

    if (fs.existsSync(source) === false)
    {
      cb(`No backup of the previous turn was found to be able to rollback.`);
      return;
    }
  }

  rw.copyDir(source, target, false, ["", ".2h", ".trn"], function(err)
  {
    if (err)
    {
      cb(err);
      return;
    }

    module.exports.changeCurrentTimer(data, function(err)
    {
      if (err)
      {
        cb(`The files were successfully rollbacked, but the timer could not be set to the default timer. Try doing it manually.`);
        return;
      }

      cb(null);
    });
  });
};
