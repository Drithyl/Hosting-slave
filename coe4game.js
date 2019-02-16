
const fs = require("fs");
const rw = require("./reader_writer.js");
const config = require("./config.json");
var games;

module.exports.init = function(gameList)
{
  games = gameList;
  return this;
}

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
