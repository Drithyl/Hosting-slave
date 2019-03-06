
const fs = require("fs");
const spawn = require("./process_spawn.js").spawn;
const kill = require("./kill_instance.js").kill;
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
  rw.readDirContent(config.dom4DataPath + "/maps", ".map", function(err, data)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    for (var filename in data)
    {
      var provinces = provCountFn(data[filename]);

      if (provinces == null)
      {
        continue;
      }

      data[filename] = provinces;
    }

    cb(null, data);
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

  rw.deleteDirContents(path, ["", ".2h", ".trn"], function(err)
  {
    if (err)
    {
      cb(err);
      return;
    }

    kill(game, function(err)
    {
      if (err)
      {
        cb(`The data was restarted, but the game's process could not be killed to reboot it. Try to use the kill command to do so manually.`);
        return;
      }

      //ignore this because the statuspage file deletion is not critical;
      //even if it remains it will be overwritten
      /*fs.unlink(`${config.statusPageBasePath}/${game.name}_status`, function(err)
      {
        if (err)
        {
          cb(`The data was restarted, but the old statuspage file could not be deleted. Try to reboot the game by using the kill and launch commands to do so manually.`);
          return;
        }*/

        spawn(game.port, game.args, game, function(err)
        {
          if (err)
          {
            cb(`The data was restarted, but the game's process could not be launched after killing it. Try to use the launch command to do so manually.`);
          }

          else cb(null);
        });
      //});
    });
  });
};

module.exports.changeCurrentTimer = function(data, cb)
{
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
        cb(`An error occurred when trying to rehost the game to change the current timer.`);
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

module.exports.getTurnInfo = function(data, cb)
{
  fs.readFile(`${config.statusPageBasePath}/${games[data.port].name}_status`, "utf8", (err, content) =>
  {
    if (err)
    {
      //Path not found error; file doesn't exist so game has not started
      if (err.message.includes("ENOENT") === true)
      {
        cb(null, "");
        return;
      }

      else
      {
        cb(err, null);
        return;
      }
    }

    cb(null, content);
  });
};
