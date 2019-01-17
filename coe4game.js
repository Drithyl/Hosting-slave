
const fs = require("fs");
const rw = require("./reader_writer.js");
const config = require("./config.json");
const spawn = require('child_process').spawn;
var games;

module.exports.init = function(gameList)
{
  games = gameList;
  return this;
}

module.exports.host = function(port, args, game, cb)
{
  if (args == null)
  {
    args = [`--gamelog=${config.statusPageBasePath}/${game.name}_status`];
  }

  else args.push(`--gamelog=${config.statusPageBasePath}/${game.name}_status`);

  if (fs.existsSync(config.dom4ExePath) === false)
  {
    cb("The coe4.exe path is incorrect. Cannot host game.");
    return;
  }

  if (args == null)
  {
    cb("No settings were provided to host this game, something went wrong.", null);
    return;
  }

  //instances get overloaded if they spent ~24h with their stdio being listened to,
  //and end up freezing (in windows server 2012)
	game.instance = spawn(config.dom4ExePath, args, {stdio: 'ignore'});
  cb(null, game.instance);
};

//TODO
module.exports.getLastHostedTime = function(data, cb)
{
  fs.stat(config.dom4DataPath + "savedgames/" + games[data.port].name + "/ftherlnd", function(err, stats)
  {
    if (err)
    {
      rw.logError({Game: games[data.port].name, data: data}, `fs.stat Error:`, err);
      cb(err, null);
    }

    else cb(null, stats.mtime.getTime());
  });
};

//TODO (save files have its own names, they don't necessarily coincide with game name)
module.exports.deleteGameSave = function(data, cb)
{
  var game = games[data.port];
  var path = `${config.coe4DataPath}/saves/${game.name}`;

  fs.readdir(path, function(err, files)
  {
    if (err)
    {
      rw.logError({Game: games.name, data: data}, `fs.readdir Error:`, err);
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
