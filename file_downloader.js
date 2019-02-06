
const fs = require("fs");
const rw = require("./reader_writer.js");
const config = require("./config.json");

//Yet Another Unzip Library. Docs: https://www.npmjs.com/package/yauzl
const yauzl = require("yauzl");

const googleDriveAPI = require("./google_drive_api/index.js");
const steamWorkshopAPI = require("./steam_workshop_api/index.js");

//These are the extensions expected in the collection of map files
const mapExtensionTest = new RegExp("(\.map)|(\.rgb)|(\.tga)$", "i");
const mapDataExtensionRegexp = new RegExp("\.map$", "i");
const mapImageExtensionRegexp = new RegExp("(\.rgb)|(\.tga)$", "i");

//These are the extensions expected in the collection of mod files
const modExtensionTest = new RegExp("(\.dm)|(\.rgb)|(\.tga)$", "i");
const modDataExtensionRegexp = new RegExp("\.dm$", "i");
const modSpriteExtensionRegexp = new RegExp("(\.rgb)|(\.tga)$", "i");

//The temporary path in which zips are piped to, then deleted once extracted
const tmpPath = `tmp`;

const mapZipMaxSize = 100000000;  //100MB in bytes
const modZipMaxSize = 10000000;   //10MB in bytes

if (fs.existsSync(tmpPath) === false)
{
  //create temporary download path if it doesn't exist
  fs.mkdirSync(tmpPath);
}

module.exports.downloadMod = function(fileId, gameType, cb)
{
  let modEntries = [];
  let modDataFilenames = [];

  //configure the final execution of the callback to delete any tmp files.
  //done this way so we don't have to add deleteTmpFile() to every step of the
  //callback chain below
  let extendedCb = function()
  {
    let args = arguments;
    console.log(`DEBUG: deleting tmp file.`);
    rw.writeToUploadLog(`Deleting temp zipfile ${fileId}...`);
    deleteTmpFile(fileId, function(err)
    {
      cb.apply(this, args);  //apply the arguments that the cb got called with originally
    });
  };

  console.log(`DEBUG: getting Metadata.`);
  rw.writeToUploadLog(`Obtaining metadata of ${gameType} mod file id ${fileId}...`);

  //obtain the file metadata (name, extension, size) first and then check that it qualifies to be downloaded
  getMetadata(fileId, function(err, metadata)
  {
    if (err)
    {
      rw.writeToUploadLog(`Failed to get metadata of ${gameType} mod file id ${fileId}:\n`, err);
      extendedCb(err);
      return;
    }

    console.log(`DEBUG: getting success.`);
    rw.writeToUploadLog(`Metadata of ${gameType} mod file id ${fileId} obtained:\n`, metadata);

    //The fileExtension property does not include the "." at the beginning of it
    if (metadata.fileExtension !== "zip")
    {
      console.log(`DEBUG: not a zipfile.`);
      rw.writeToUploadLog(`Mod file id ${fileId} is not a zipfile.`);
      extendedCb("Only .zip files are supported. Please send the file id of a .zip file so it can be unzipped into the proper directory.");
      return;
    }

    //won't support map zips of over 25MB (metadata size is in bytes)
    if (metadata.size > modZipMaxSize)
    {
      console.log(`DEBUG: file too big.`);
      rw.writeToUploadLog(`Mod file id ${fileId} has a size of ${metadata.size}, which is beyond the limit of ${modZipMaxSize}.`);
      extendedCb(`For bandwith reasons, your file cannot be over ${modZipMaxSize * 0.000001}MB in size. Please choose a smaller file.`);
      return;
    }

    console.log(`DEBUG: getting zipfile.`);
    rw.writeToUploadLog(`Downloading and fetching ${gameType} mod zipfile ${fileId}...`);

    //obtain the zipfile in proper form through yauzl
    getZipfile(fileId, function(err, zipfile)
    {
      if (err)
      {
        rw.writeToUploadLog(`Failed to get the ${gameType} mod zipfile ${fileId}:\n`, err);
        extendedCb(err);
        return;
      }

      console.log(`DEBUG: getting zipfile success`);
      rw.writeToUploadLog(`Fetching entries of ${gameType} mod zipfile ${fileId}...`);
      console.log(`DEBUG: getting zipentries`);

      //obtain the entries (files) in the zipfile, and filter them by extension
      getZipEntries(zipfile, function(err, entries)
      {
        if (err)
        {
          rw.writeToUploadLog(`Failed to get the entries of ${gameType} mod zipfile ${fileId}:\n`, err);
          extendedCb(err);
          return;
        }

        rw.writeToUploadLog(`Filtering entries by extension...`);

        console.log(`DEBUG: filtering zip entries by extension.`);

        entries.forEach(function(entry)
        {
          //select only the relevant files to extract (directories are included
          //so that the mod structure can be preserved properly)
          //directories finish their name in /
          if (modDataExtensionRegexp.test(entry.fileName) === true)
          {
            console.log(`DEBUG: keeping data file ${entry.fileName}.`);
            rw.writeToUploadLog(`Keeping data file ${entry.fileName}.`);
            modEntries.push(entry);
            modDataFilenames.push(entry.fileName);
          }

          else if (modDataExtensionRegexp.test(entry.fileName) === true || /\/$/.test(entry.fileName) === true)
          {
            console.log(`DEBUG: keeping sprite file ${entry.fileName}.`);
            rw.writeToUploadLog(`Keeping sprite file ${entry.fileName}.`);
            modEntries.push(entry);
          }

          else rw.writeToUploadLog(`Skipping file ${entry.fileName}.`);
        });

        rw.writeToUploadLog(`Writing mod entries to disk...`);
        console.log(`DEBUG: writing mod files`);

        //write the file data from all entries obtained from the zipfile
        writeModFiles(zipfile, modEntries, gameType, function(err, failedFileErrors)
        {
          if (err)
          {
            rw.writeToUploadLog(`Failed to write mod entries to disk:\n`, err);
            extendedCb(err);
            return;
          }

          console.log(`DEBUG: mod files written successfully`);
          rw.writeToUploadLog(`Entries written successfully.`);
          extendedCb(null, failedFileErrors, modDataFilenames);
        });
      });
    });
  });
};

//download a map zip pack through a google drive file ID (the google drive file
//ID can be obtained by getting a shareable link on the file: https://drive.google.com/open?id=THIS_IS_THE_FILE_ID)
module.exports.downloadMap = function(fileId, gameType, cb)
{
  let mapEntries = [];
  let mapDataFilenames = [];

  //configure the final execution of the callback to delete any tmp files.
  //done this way so we don't have to add deleteTmpFile() to every step of the
  //callback chain below
  let extendedCb = function()
  {
    rw.writeToUploadLog(`Deleting temp zipfile ${fileId}...`);
    deleteTmpFile(fileId);
    cb.apply(this, arguments);  //apply the arguments that the cb got called with originally
  };

  rw.writeToUploadLog(`Obtaining metadata of ${gameType} map file id ${fileId}...`);

  //obtain the file metadata (name, extension, size) first and then check that it qualifies to be downloaded
  getMetadata(fileId, function(err, metadata)
  {
    if (err)
    {
      rw.writeToUploadLog(`Failed to get metadata of ${gameType} map file id ${fileId}:\n`, err);
      extendedCb(err);
      return;
    }

    rw.writeToUploadLog(`Metadata of ${gameType} map file id ${fileId} obtained:\n`, metadata);

    //The fileExtension property does not include the "." at the beginning of it
    if (metadata.fileExtension !== "zip")
    {
      rw.writeToUploadLog(`Map file id ${fileId} is not a zipfile.`);
      extendedCb("Only .zip files are supported. Please send the file id of a .zip file so it can be unzipped into the proper directory.");
      return;
    }

    //won't support map zips of over 100MB (metadata size is in bytes)
    if (metadata.size > mapZipMaxSize)
    {
      rw.writeToUploadLog(`Map file id ${fileId} has a size of ${metadata.size}, which is beyond the limit of ${mapZipMaxSize}.`);
      extendedCb(`For bandwith reasons, your file cannot be over ${mapZipMaxSize * 0.000001}MB in size. Please choose a smaller file.`);
      return;
    }

    rw.writeToUploadLog(`Downloading and fetching ${gameType} map zipfile ${fileId}...`);

    //obtain the zipfile in proper form through yauzl
    getZipfile(fileId, function(err, zipfile)
    {
      if (err)
      {
        rw.writeToUploadLog(`Failed to get the ${gameType} map zipfile ${fileId}:\n`, err);
        extendedCb(err);
        return;
      }

      rw.writeToUploadLog(`Fetching entries of ${gameType} map zipfile ${fileId}...`);

      //obtain the entries (files) in the zipfile, and filter them by extension
      getZipEntries(zipfile, function(err, entries)
      {
        if (err)
        {
          rw.writeToUploadLog(`Failed to get the entries of ${gameType} map zipfile ${fileId}:\n`, err);
          extendedCb(err);
          return;
        }

        rw.writeToUploadLog(`Filtering entries by extension...`);

        entries.forEach(function(entry)
        {
          //select only the relevant files to extract
          if (mapDataExtensionRegexp.test(entry.fileName) === true)
          {
            rw.writeToUploadLog(`Keeping data file ${entry.fileName}.`);
            mapEntries.push(entry);
            mapDataFilenames.push(entry.fileName);
          }

          else if (mapImageExtensionRegexp.test(entry.fileName) === true)
          {
            rw.writeToUploadLog(`Keeping image file ${entry.fileName}.`);
            mapEntries.push(entry);
          }

          else rw.writeToUploadLog(`Skipping file ${entry.fileName}.`);
        });

        rw.writeToUploadLog(`Writing map entries to disk...`);

        //write the file data from all entries obtained from the zipfile
        writeMapFiles(zipfile, mapEntries, gameType, function(err, failedFileErrors)
        {
          if (err)
          {
            rw.writeToUploadLog(`Failed to write map entries to disk:\n`, err);
            extendedCb(err);
            return;
          }

          rw.writeToUploadLog(`Entries written successfully`);
          extendedCb(null, failedFileErrors, mapDataFilenames);
        });
      });
    });
  });
};

function getMetadata(fileId, cb)
{
  googleDriveAPI.getFileMetadata(fileId, null, function(err, metadata)
  {
    if (err)
    {
      console.log(`DEBUG: getting Metadata error`, err);
      cb(err);
    }

    else cb(null, metadata);
  });
}

function getZipfile(fileId, cb)
{
  let path = `${tmpPath}/${fileId}.zip`;

  googleDriveAPI.downloadFile(fileId, path, function(err)
  {
    if (err)
    {
      console.log(`DEBUG: getting zipfile error`, err);
      rw.writeToUploadLog(`File id ${fileId} could not be downloaded due to an error:\n`, err);
      cb(err);
      return;
    }

    console.log(`DEBUG: yauzl.open starting`);
    rw.writeToUploadLog(`File ${fileId}.zip downloaded.`);

    yauzl.open(path, {lazyEntries: true, autoClose: false}, function(err, zipfile)
    {
      if (err)
      {
        console.log(`DEBUG: yauzl open error`, err);
        cb(err);
        return;
      }

      cb(null, zipfile);
    });
  });
}

function getZipEntries(zipfile, cb)
{
  let entries = [];

  //emits "entry" event once it's done reading an entry
  zipfile.readEntry();

  zipfile.on("error", function(err)
  {
    console.log(`DEBUG: readEntry error`,err);
    cb(err);
  });

  zipfile.on("entry", function(entry)
  {
    console.log(`DEBUG: entry read, pushing`);
    entries.push(entry);
    zipfile.readEntry();
  });

  //last entry was read, we can callback now
  zipfile.on("end", function()
  {
    console.log(`DEBUG: readEntry end`);
    cb(null, entries);
  });
}

//Parameter zipfile and entries are expected in the types provided by yauzl. See docs: https://www.npmjs.com/package/yauzl
function writeMapFiles(zipfile, entries, gameType, cb)
{
  let dataPath = `${getGameDataPath(gameType)}/maps`;
  let errors = [];

  entries.forEach(function(entry, index)
  {
    if (fs.existsSync(`${dataPath}/${entry.fileName}`) === true)
    {
      rw.writeToUploadLog(`The file ${entry.fileName} already exists; it will not be replaced.`);
      errors.push(`The file ${entry.fileName} already exists; it will not be replaced.`);
    }
  });

  //found files that already exist, do not write any file
  if (errors.length > 0)
  {
    rw.writeToUploadLog(`No map files have been written due to an existing file conflict.`);
    cb(`One or more files contained inside the .zip file already existed in the maps folder. See the details below:\n\n${errors}`);
    return;
  }

  loop();

  function loop()
  {
    if (entries.length < 1)
    {
      zipfile.close();

      if (errors.length < 1)
      {
        rw.writeToUploadLog(`Finished writing map entries. No errors occurred.`);
      }

      else rw.writeToUploadLog(`Finished writing map entries. Errors encountered:\n`, errors);

      cb(null, errors);
      return;
    }

    let entry = entries.shift();

    zipfile.openReadStream(entry, function(err, readStream)
    {
      //if error, add to error messages and continue looping
      if (err)
      {
        errors.push(err);
        rw.writeToUploadLog(`Error opening a readStream at path ${dataPath}/${entry.fileName}.`);
        loop();
        return;
      }

      readStream.on("error", function(err)
      {
        //if error, add to error messages and continue looping
        errors.push(err);
        rw.writeToUploadLog(`Error occurred during readStream for file ${entry.fileName}:`, err);
        loop();
        return;
      });

      //finished reading, move on to next entry
      readStream.on("end", function()
      {
        rw.writeToUploadLog(`Map file ${entry.fileName} written.`);
        loop();
      });

      let writeStream = fs.createWriteStream(`${dataPath}/${entry.fileName}`);

      //write the stream to the correspondent path
      readStream.pipe(writeStream);
    });
  }
}

//Parameter zipfile and entries are expected in the types provided by yauzl. See docs: https://www.npmjs.com/package/yauzl
function writeModFiles(zipfile, entries, gameType, cb)
{
  let dataPath = `${getGameDataPath(gameType)}/mods`;
  let errors = [];

  //Don't replace .dm files, as it might cause conflicts. For now, image files
  //will be replaced without question. TODO: find a safer way to handle file
  //overwrites, so that it's not easy to upload improper sprites to hijack a mod
  entries.forEach(function(entry, index)
  {
    console.log(`DEBUG: looping through ${entry.fileName}`);
    if (/\.dm$/.test(entry.fileName) === true && fs.existsSync(`${dataPath}/${entry.fileName}`) === true)
    {
      console.log(`DEBUG: already exists.`);
      rw.writeToUploadLog(`The .dm file ${entry.fileName} already exists; it will not be replaced.`);
      errors.push(`The .dm file ${entry.fileName} already exists; it will not be replaced, as this could cause issues with ongoing games using it. If you're uploading a new version of the mod, change the name of the .dm file adding the version number so it doesn't conflict.`);
    }
  });

  //found files that already exist, do not write any file
  if (errors.length > 0)
  {
    rw.writeToUploadLog(`.dm files cannot be overwritten, skipping those.`);
    cb(`One or more .dm files contained inside the .zip file already existed in the mods folder and will not be overwritten. See the details below:\n\n${errors}`);
    return;
  }

  loop();

  function loop()
  {
    if (entries.length < 1)
    {
      console.log(`DEBUG: finished writing entries.`);
      zipfile.close();

      if (errors.length < 1)
      {
        rw.writeToUploadLog(`Finished writing mod entries. No errors occurred.`);
      }

      else rw.writeToUploadLog(`Finished writing mod entries. Errors encountered:\n`, errors);

      cb(null, errors);
      return;
    }

    let entry = entries.shift();
    console.log(`DEBUG: looping through ${entry.fileName}.`);

    //fileName ends in /, therefore it's a directory. Create it if it doesn't exist to preserve mod structure
    if (/\/$/.test(entry.fileName) === true)
    {
      console.log(`DEBUG: this is a directory.`);
      //if it exists, ignore and continue looping
      if (fs.existsSync(`${dataPath}/${entry.fileName}`) === true)
      {
        console.log(`DEBUG: directory already exists.`);
        rw.writeToUploadLog(`The directory ${entry.fileName} already exists.`);
        loop();
        return;
      }

      console.log(`DEBUG: making dir.`);
      fs.mkdir(`${dataPath}/${entry.fileName}`, function(err)
      {
        if (err)
        {
          console.log(`DEBUG: mkdir() error`, err);
          errors.push(err);
          rw.writeToUploadLog(`Error creating the directory ${entry.fileName}.`);
          cb(`Error creating the directory ${entry.fileName}.`);
          return;
        }

        console.log(`DEBUG: dir written.`);
        rw.writeToUploadLog(`Mod directory ${entry.fileName} written.`);
        loop();
      });
    }

    else
    {
      console.log(`DEBUG: is a file`);
      zipfile.openReadStream(entry, function(err, readStream)
      {
        //if error, add to error messages and continue looping
        if (err)
        {
          console.log(`DEBUG: openReadStream error`, err);
          errors.push(err);
          rw.writeToUploadLog(`Error opening a readStream at path ${dataPath}/${entry.fileName}.`);
          loop();
          return;
        }

        readStream.on("error", function(err)
        {
          console.log(`DEBUG: error during readstream`, err);
          //if error, add to error messages and continue looping
          errors.push(err);
          rw.writeToUploadLog(`Error occurred during readStream for file ${entry.fileName}:`, err);
          loop();
          return;
        });

        //finished reading, move on to next entry
        readStream.on("end", function()
        {
          console.log(`DEBUG: readstream ended`);
          rw.writeToUploadLog(`Mod file ${entry.fileName} written.`);
          loop();
        });

        console.log(`DEBUG: creating writeStream`);
        let writeStream = fs.createWriteStream(`${dataPath}/${entry.fileName}`);
        console.log(`DEBUG: writeStream created.`);

        //write the stream to the correspondent path
        readStream.pipe(writeStream);
      });
    }
  }
}

//We're not using a callback because if the execution fails, we'll just print it
//to the bot log; the user doesn't need to know about it.
function deleteTmpFile(fileId, cb)
{
  let path = `${tmpPath}/${fileId}`;

  if (fs.existsSync(`${path}.zip`) === false && fs.existsSync(path) === false)
  {
    console.log(`DEBUG: tmp file does not exist anymore.`);
    return;
  }

  else if (fs.existsSync(`${path}.zip`) === true && fs.existsSync(path) === false)
  {
    path = `${path}.zip`;
  }

  fs.unlink(path, function(err)
  {
    if (err)
    {
      console.log(`DEBUG: unlink err`, err);
      rw.writeToUploadLog(`Failed to delete the temp zipfile ${fileId}:\n`, err);
      cb(err);
      return;
    }

    rw.writeToUploadLog(`Temp zipfile ${fileId} was successfully deleted.`);
    cb(null);
  });
}

function getGameDataPath(gameType)
{
  var path;

  switch(gameType.toLowerCase().trim())
  {
    case "dom4":
    return `${config.dom4DataPath}`;

    case "dom5":
    return `${config.dom5DataPath}`;

    default:
    return null;
  }
}
