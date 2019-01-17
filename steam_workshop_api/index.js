
//DOCUMENTATION AT: https://www.npmjs.com/package/steam-workshop
const SteamWorkshop = require('steam-workshop');
const config = require("../config.json");

//Steam Workshop object to download files, must specify where to download them
//var steamWorkshop = new SteamWorkshop(`${config.dom5dom5DataPath}/maps`);

module.exports.downloadFile = function(fileId, destination, cb)
{
  steamWorkshop.downloadFile(fileId, function(err, files)
  {
    if (err)
    {
      cb(err);
      return;
    }


  });
}
