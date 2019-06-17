
const fs = require("fs");
const rw = require("./reader_writer.js");
const config = require("./config.json");

//Yet Another Unzip Library. Docs: https://www.npmjs.com/package/yauzl
const yauzl = require("yauzl");

const googleDriveAPI = require("./google_drive_api/index.js");
//const steamWorkshopAPI = require("./steam_workshop_api/index.js");

//These are the extensions expected in the collection of map files
const mapExtensionTest = new RegExp("(\.map)|(\.rgb)|(\.tga)$", "i");
const mapDataExtensionRegexp = new RegExp("\.map$", "i");
const mapImageExtensionRegexp = new RegExp("(\.rgb)|(\.tga)|(\.png)$", "i");

//These are the extensions expected in the collection of mod files
const modExtensionTest = new RegExp("(\.dm)|(\.rgb)|(\.tga)$", "i");
const modDataExtensionRegexp = new RegExp("\.dm$", "i");
const modSpriteExtensionRegexp = new RegExp("(\.rgb)|(\.tga)|(\.png)$", "i");
const modSoundExtensionRegexp = new RegExp("\.sw$", "i");

//The temporary path in which zips are piped to, then deleted once extracted
const tmpPath = `tmp`;

const mapZipMaxSize = config.maxMapSizeInMB * 1000000;  //100MB in bytes
const modZipMaxSize = config.maxModSizeInMB * 1000000;  //10MB in bytes

if (fs.existsSync(tmpPath) === false)
{
  //create temporary download path if it doesn't exist
  fs.mkdirSync(tmpPath);
}

module.exports.downloadMod = function(fileId, gameType, serverCb)
{
  let modEntries = [];
  let modDataFilenames = [];
  let percentageCompleted = 0;
  let lastChunkSizeUpdate = 0;

  rw.log("upload", `Obtaining metadata of ${gameType} mod file id ${fileId}...`);

  //obtain the file metadata (name, extension, size) first and then check that it qualifies to be downloaded
  getMetadata(fileId, function(err, metadata)
  {
    if (err)
    {
      return serverCb({err: err.message});
    }

    rw.log("upload", `Metadata of ${gameType} mod file id ${fileId} obtained:\n`, metadata);

    //The fileExtension property does not include the "." at the beginning of it
    if (metadata.fileExtension !== "zip")
    {
      rw.log("upload", `Mod file id ${fileId} is not a zipfile.`);
      return serverCb({err: "Only .zip files are supported. Please send the file id of a .zip file so it can be unzipped into the proper directory."});
    }

    //won't support mod zips of over 25MB (metadata size is in bytes)
    if (metadata.size > modZipMaxSize)
    {
      rw.log("upload", `Mod file id ${fileId} has a size of ${metadata.size}, which is beyond the limit of ${modZipMaxSize}.`);
      return serverCb({err: `For bandwith reasons, your file cannot be over ${modZipMaxSize * 0.000001}MB in size. Please choose a smaller file.`});
    }

    rw.log("upload", `Downloading and fetching ${gameType} mod zipfile ${fileId}...`);

    //obtain the zipfile in proper form through yauzl
    getZipfile(fileId, function(err, zipfile)
    {
      if (err)
      {
        deleteTmpFile(fileId);
        return serverCb({err: err.message});
      }

      rw.log("upload", `Fetching entries of ${gameType} mod zipfile ${fileId}...`);

      //obtain the entries (files) in the zipfile, and filter them by extension
      getZipEntries(zipfile, function(err, entries)
      {
        if (err)
        {
          rw.log("upload", `Failed to get the entries of ${gameType} mod zipfile ${fileId}:\n`, err);
          deleteTmpFile(fileId);
          return serverCb({err: err.message});
        }

        rw.log("upload", `Filtering entries by extension...`);

        entries.forEach(function(entry)
        {
          //directories finish their name in /
          if (/\/$/.test(entry.fileName) === true)
          {
            rw.log("upload", `Keeping directory ${entry.fileName}.`);
            modEntries.push(entry);
          }

          //select only the relevant files to extract (directories are included
          //so that the mod structure can be preserved properly)
          else if (modDataExtensionRegexp.test(entry.fileName) === true)
          {
            rw.log("upload", `Keeping data file ${entry.fileName}.`);
            modEntries.push(entry);
            modDataFilenames.push(entry.fileName);
          }

          else if (modSpriteExtensionRegexp.test(entry.fileName) === true)
          {
            rw.log("upload", `Keeping sprite file ${entry.fileName}.`);
            modEntries.push(entry);
          }

          else if (modSoundExtensionRegexp.test(entry.fileName) === true)
          {
            rw.log("upload", `Keeping sound file ${entry.fileName}.`);
            modEntries.push(entry);
          }

          else rw.log("upload", `Skipping file ${entry.fileName}.`);
        });

        rw.log("upload", `Writing mod entries to disk...`);

        //write the file data from all entries obtained from the zipfile
        writeModFiles(zipfile, modEntries, gameType, function(err, failedFileErrors, modFilesWritten)
        {
          if (err)
          {
            rw.log("upload", `Failed to write mod entries to disk:\n\n${err.message}`);
            deleteTmpFile(fileId);
            return serverCb({failedFileErrors: failedFileErrors, modFilesWritten: modFilesWritten, err: err.message});
          }

          rw.log("upload", `Entries written successfully.`);
          deleteTmpFile(fileId);
          return serverCb({isDone: true, failedFileErrors: failedFileErrors, modFilesWritten: modFilesWritten});
        });
      });

    //provide an update callback to getZipfile to receive updates of chunks downloaded
    }, updatePercentage(metadata.size, serverCb));
  });
};

//download a map zip pack through a google drive file ID (the google drive file
//ID can be obtained by getting a shareable link on the file: https://drive.google.com/open?id=THIS_IS_THE_FILE_ID)
module.exports.downloadMap = function(fileId, gameType, serverCb)
{
  let mapEntries = [];
  let mapDataFilenames = [];
  let percentageCompleted = 0;
  let lastChunkSizeUpdate = 0;

  rw.log("upload", `Obtaining metadata of ${gameType} map file id ${fileId}...`);

  //obtain the file metadata (name, extension, size) first and then check that it qualifies to be downloaded
  getMetadata(fileId, function(err, metadata)
  {
    if (err)
    {
      return serverCb({err: err.message});
    }

    rw.log("upload", `Metadata of ${gameType} map file id ${fileId} obtained:\n`, metadata);

    //The fileExtension property does not include the "." at the beginning of it
    if (metadata.fileExtension !== "zip")
    {
      rw.log("upload", `Map file id ${fileId} is not a zipfile.`);
      return serverCb({err: "Only .zip files are supported. Please send the file id of a .zip file so it can be unzipped into the proper directory."});
    }

    //won't support map zips of over 100MB (metadata size is in bytes)
    if (metadata.size > mapZipMaxSize)
    {
      rw.log("upload", `Map file id ${fileId} has a size of ${metadata.size}, which is beyond the limit of ${mapZipMaxSize}.`);
      return serverCb({err: `For bandwith reasons, your file cannot be over ${mapZipMaxSize * 0.000001}MB in size. Please choose a smaller file.`});
    }

    rw.log("upload", `Downloading and fetching ${gameType} map zipfile ${fileId}...`);

    //obtain the zipfile in proper form through yauzl
    getZipfile(fileId, function(err, zipfile)
    {
      if (err)
      {
        deleteTmpFile(fileId);
        return serverCb({err: err.message});
      }

      rw.log("upload", `Fetching entries of ${gameType} map zipfile ${fileId}...`);

      //obtain the entries (files) in the zipfile, and filter them by extension
      getZipEntries(zipfile, function(err, entries)
      {
        if (err)
        {
          rw.log("upload", `Failed to get the entries of ${gameType} map zipfile ${fileId}:\n`, err);
          deleteTmpFile(fileId);
          return serverCb({err: err.message});
        }

        rw.log("upload", `Filtering entries by extension...`);

        entries.forEach(function(entry)
        {
          //select only the relevant files to extract
          if (mapDataExtensionRegexp.test(entry.fileName) === true)
          {
            //.map files that begin with two underscores __ don't get found
            //properly by the --mapfile flag, so make sure to remove them here
            if (/^\_+/g.test(entry.fileName) === true)
            {
              rw.log("upload", `Map data file ${entry.fileName} contains underscores at the beginning of its name, removing them.`);
              entry.fileName = entry.fileName.replace(/^\_+/g, "");
            }

            rw.log("upload", `Keeping data file ${entry.fileName}.`);
            mapEntries.push(entry);
            mapDataFilenames.push(entry.fileName);
          }

          else if (mapImageExtensionRegexp.test(entry.fileName) === true)
          {
            rw.log("upload", `Keeping image file ${entry.fileName}.`);
            mapEntries.push(entry);
          }

          else rw.log("upload", `Skipping file ${entry.fileName}.`);
        });

        rw.log("upload", `Writing map entries to disk...`);

        //write the file data from all entries obtained from the zipfile
        writeMapFiles(zipfile, mapEntries, gameType, function(err, failedFileErrors)
        {
          if (err)
          {
            rw.log("upload", `Failed to write map entries to disk:\n\n${err.message}`);
            deleteTmpFile(fileId);
            return serverCb({failedFileErrors: failedFileErrors, err: err.message});
          }

          rw.log("upload", `Entries written successfully`);
          deleteTmpFile(fileId);
          return serverCb({isDone: true, failedFileErrors: failedFileErrors});
        });
      });

    //provide an update callback to getZipfile to receive updates of chunks downloaded
    }, updatePercentage(metadata.size, serverCb));
  });
};

function getMetadata(fileId, cb)
{
  googleDriveAPI.getFileMetadata(fileId, null, function(err, metadata)
  {
    if (err)
    {
      rw.log("upload", `Failed to get metadata of file id ${fileId}. Response status is ${err.status} (${err.statusText}).`);
      cb(new Error(`Failed to get metadata of file id ${fileId}. Response status is ${err.status} (${err.statusText}).`));
    }

    else if (metadata == null)
    {
      rw.log("upload", `Metadata of file id ${fileId} is invalid (${metadata}).`);
      cb(new Error(`Metadata of file id ${fileId} is invalid or this file has no metadata. Perhaps you're not linking a .zip file?`));
    }

    else cb(null, metadata);
  });
}

function getZipfile(fileId, cb, updateCb)
{
  let path = `${tmpPath}/${fileId}.zip`;

  googleDriveAPI.downloadFile(fileId, path, function(err, isDone, chunkByteSize)
  {
    if (err)
    {
      //this is a google drive get error
      if (err.status != null)
      {
        rw.log("upload", `Failed to download file id ${fileId} from google drive. Google Drive's response status is ${err.status} (${err.statusText}).`);
        return cb(new Error(`Failed to download file id ${fileId} from google drive. Google Drive's response status is ${err.status} (${err.statusText}).`));
      }

      //this is a nodejs stream error
      else
      {
        rw.log("upload", `Failed to write downloaded file with id ${fileId} to disk. ${err.code}:\n\n${err.message}`);
        return cb(new Error(`Failed to write downloaded file with id ${fileId} to disk. ${err.code}:\n\n${err.message}`));
      }
    }

    rw.log("upload", `Zipfile downloaded, opening it...`);

    //cb finished
    else if (isDone === true)
    {
      rw.log("upload", `File ${fileId}.zip downloaded. Using yauzl to open it...`);

      yauzl.open(path, {lazyEntries: true, autoClose: false}, function(err, zipfile)
      {
        if (err)
        {
          rw.log(["upload", "error"], `Error occurred when opening ${fileId}:\n\n${err.message}`);
          cb(err);
          return;
        }

        cb(null, zipfile);
      });
    }

    //received new chunk size in the read stream so update
    else if (typeof updateCb === "function")
    {
      updateCb(chunkByteSize)
    }
  });
}

//closure returning an update callback for the getZipfile() function
//if updateCb is provided it will call it whenever a new percentage
//integer is completed to update the client of the progress
function updatePercentage(fileSize, updateServerCb)
{
  let percentageCompleted = 0;
  let lastChunkSizeUpdate = 0;

  if (typeof updateServerCb === "function")
  {
    rw.log("upload", `updateCb provided to updatePercentage(); will send back download percentage updates to client.`);
  }

  return function(chunkByteSize)
  {
    //update the percentage completed with the previously received chunk,
    //since it is now downloaded, and update the size value for the next one
    let newPercentageCompleted = percentageCompleted + (lastChunkSizeUpdate / fileSize) * 100;

    if (Math.floor(newPercentageCompleted) > Math.floor(percentageCompleted))
    {
      rw.log("upload", `${Math.floor(newPercentageCompleted)}% completed.`);

      if (typeof updateServerCb === "function")
      {
        //never send an error in this callback
        updateServerCb({progress: Math.floor(newPercentageCompleted)});
      }
    }

    percentageCompleted = newPercentageCompleted;
    lastChunkSizeUpdate = chunkByteSize;
  }
}

function getZipEntries(zipfile, cb)
{
  let entries = [];

  //emits "entry" event once it's done reading an entry
  zipfile.readEntry();

  zipfile.on("error", function(err)
  {
    rw.log("upload", `readEntry() error`, err);
    cb(err);
  });

  zipfile.on("entry", function(entry)
  {
    entries.push(entry);
    zipfile.readEntry();
  });

  //last entry was read, we can callback now
  zipfile.on("end", function()
  {
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
      rw.log("upload", `The file ${entry.fileName} already exists; it will not be replaced.`);
      errors.push(`The file ${entry.fileName} already exists; it will not be replaced.`);
    }
  });

  //found files that already exist, do not write any file
  if (errors.length > 0)
  {
    rw.log("upload", `No map files have been written due to an existing file conflict.`);
    cb(new Error(`One or more files contained inside the .zip file already existed in the maps folder. See the details below:\n\n${errors}`));
    return;
  }

  entries.forEachAsync(function(entry, index, next)
  {
    zipfile.openReadStream(entry, function(err, readStream)
    {
      //if error, add to error messages and continue looping
      if (err)
      {
        errors.push(err);
        rw.log("upload", `Error opening a readStream at path ${dataPath}/${entry.fileName}.`);
        next();
        return;
      }

      readStream.on("error", function(err)
      {
        //if error, add to error messages and continue looping
        errors.push(err);
        rw.log("upload", `Error occurred during readStream for file ${entry.fileName}:`, err);
        next();
        return;
      });

      //finished reading, move on to next entry
      readStream.on("end", function()
      {
        rw.log("upload", `Map file ${entry.fileName} written.`);
        next();
      });

      let writeStream = fs.createWriteStream(`${dataPath}/${entry.fileName}`);

      writeStream.on('error', function(err)
      {
        errors.push(err);
        writeStream.end();
        rw.log("upload", `Error occurred during writeStream for file ${entry.fileName}:`, err);
        next();
        return;
      });

      //write the stream to the correspondent path
      readStream.pipe(writeStream);
    });

  }, function callback()
  {
    zipfile.close();

    if (errors.length < 1)
    {
      rw.log("upload", `Finished writing map entries. No errors occurred.`);
    }

    else rw.log("upload", `Finished writing map entries. Errors encountered:\n`, errors);

    cb(null, errors);
  });
}

//Parameter zipfile and entries are expected in the types provided by yauzl. See docs: https://www.npmjs.com/package/yauzl
function writeModFiles(zipfile, entries, gameType, cb)
{
  let dataPath = `${getGameDataPath(gameType)}/mods`;
  let errors = [];
  let printArr = [];

  //Don't replace .dm files, as it might cause conflicts. For now, image files
  //will be replaced without question. TODO: find a safer way to handle file
  //overwrites, so that it's not easy to upload improper sprites to hijack a mod
  entries = entries.filter(function(entry, index)
  {
    if (/\.dm$/.test(entry.fileName) === true && fs.existsSync(`${dataPath}/${entry.fileName}`) === true)
    {
      rw.log("upload", `The .dm file ${entry.fileName} already exists; it will not be replaced.`);
      errors.push(`The .dm file ${entry.fileName} already exists; it will not be replaced, as this could cause issues with ongoing games using it. If you're uploading a new version of the mod, change the name of the .dm file adding the version number so it doesn't conflict.`);
    }

    else return entry;
  });

  entries.forEachAsync(function(entry, index, next)
  {
    rw.checkAndCreateDir(`${dataPath}/${entry.fileName}`);

    //fileName ends in /, therefore it's a directory. Create it if it doesn't exist to preserve mod structure
    if (/\/$/.test(entry.fileName) === true)
    {
      //if it exists, ignore and continue looping
      if (fs.existsSync(`${dataPath}/${entry.fileName}`) === true)
      {
        rw.log("upload", `The directory ${entry.fileName} already exists.`);
        next();
        return;
      }

      fs.mkdir(`${dataPath}/${entry.fileName}`, function(err)
      {
        if (err)
        {
          errors.push(err);
          rw.log("upload", `Error creating the directory ${entry.fileName}.`);
          cb(`Error creating the directory ${entry.fileName}.`);
          return;
        }

        rw.log("upload", `Mod directory ${entry.fileName} written.`);
        next();
      });
    }

    else
    {
      zipfile.openReadStream(entry, function(err, readStream)
      {
        //if error, add to error messages and continue looping
        if (err)
        {
          errors.push(err);
          rw.log("upload", `Error opening a readStream at path ${dataPath}/${entry.fileName}.`);
          next();
          return;
        }

        readStream.on("error", function(err)
        {
          //if error, add to error messages and continue looping
          errors.push(err);
          rw.log("upload", `Error occurred during readStream for file ${entry.fileName}:`, err);
          next();
          return;
        });

        //finished reading, move on to next entry
        readStream.on("end", function()
        {
          rw.log("upload", `Mod file ${entry.fileName} written.`);
          next();
        });

        let writeStream = fs.createWriteStream(`${dataPath}/${entry.fileName}`);

        writeStream.on('error', function(err)
        {
          errors.push(err);
          writeStream.end();
          rw.log("upload", `Error occurred during writeStream for file ${entry.fileName}:`, err);
          next();
          return;
        });

        //write the stream to the correspondent path
        readStream.pipe(writeStream);
      });
    }

  }, function callback()
  {
    zipfile.close();

    if (errors.length < 1)
    {
      rw.log("upload", `Finished writing mod entries. No errors occurred.`);
    }

    else rw.log("upload", `Finished writing mod entries. Errors encountered:\n`, errors);

    cb(null, errors);
  });
}

//We're not using a callback because if the execution fails, we'll just print it
//to the bot log; the user doesn't need to know about it.
function deleteTmpFile(fileId)
{
  let path = `${tmpPath}/${fileId}`;

  rw.log("upload", `Deleting temp zipfile ${fileId}...`);

  if (fs.existsSync(`${path}.zip`) === false && fs.existsSync(path) === false)
  {
    rw.log("upload", `Temp zipfile ${fileId} did not exist.`);
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
      rw.log("upload", `Failed to delete the temp zipfile ${fileId}:\n\n${err.message}`);
    }

    else rw.log("upload", `Temp zipfile ${fileId} was successfully deleted.`);
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
