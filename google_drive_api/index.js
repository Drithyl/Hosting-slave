
/***********************************************************
*           API RESPONSE CODES (found in .response.status):
*
      "100": "Continue",
      "101": "Switching Protocols",
      "102": "Processing",
      "200": "OK",
      "201": "Created",
      "202": "Accepted",
      "203": "Non-Authoritative Information",
      "204": "No Content",
      "205": "Reset Content",
      "206": "Partial Content",
      "207": "Multi-Status",
      "208": "Already Reported",
      "226": "IM Used",
      "300": "Multiple Choices",
      "301": "Moved Permanently",
      "302": "Found",
      "303": "See Other",
      "304": "Not Modified",
      "305": "Use Proxy",
      "307": "Temporary Redirect",
      "308": "Permanent Redirect",
      "400": "Bad Request",
      "401": "Unauthorized",
      "402": "Payment Required",
      "403": "Forbidden",
      "404": "Not Found",
      "405": "Method Not Allowed",
      "406": "Not Acceptable",
      "407": "Proxy Authentication Required",
      "408": "Request Timeout",
      "409": "Conflict",
      "410": "Gone",
      "411": "Length Required",
      "412": "Precondition Failed",
      "413": "Payload Too Large",
      "414": "URI Too Long",
      "415": "Unsupported Media Type",
      "416": "Range Not Satisfiable",
      "417": "Expectation Failed",
      "418": "I'm a teapot",
      "421": "Misdirected Request",
      "422": "Unprocessable Entity",
      "423": "Locked",
      "424": "Failed Dependency",
      "425": "Unordered Collection",
      "426": "Upgrade Required",
      "428": "Precondition Required",
      "429": "Too Many Requests",
      "431": "Request Header Fields Too Large",
      "451": "Unavailable For Legal Reasons",
      "500": "Internal Server Error",
      "501": "Not Implemented",
      "502": "Bad Gateway",
      "503": "Service Unavailable",
      "504": "Gateway Timeout",
      "505": "HTTP Version Not Supported",
      "506": "Variant Also Negotiates",
      "507": "Insufficient Storage",
      "508": "Loop Detected",
      "509": "Bandwidth Limit Exceeded",
      "510": "Not Extended",
      "511": "Network Authentication Required"
*******************************************************************/


/********************************************************************************************************************************************************
* Node.js quickstart guide: https://developers.google.com/drive/api/v3/quickstart/nodejs                                                                *
* Article: https://medium.com/@humadvii/downloading-files-from-google-drive-using-node-js-3704c142a5f6                                                  *
* Documentation: https://developers.google.com/drive/api/v3/about-sdk                                                                                   *
* Metadata fields property explanation: https://stackoverflow.com/questions/51406491/google-drive-api-v3-doesnt-list-specified-metadata-of-file-folder  *
*                                                                                                                                                       *
* The parameteres @param fileId are the google drive file IDs that can be obtained when clicking on "Get Shareable Link" on the google drive website.   *
* The links themselves contain the id, like such: https://drive.google.com/open?id=THIS_IS_THE_FILE_ID                                  *
********************************************************************************************************************************************************/

const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const CREDENTIALS_PATH = "./google_drive_api/credentials.json";
const TOKEN_PATH = "./google_drive_api/token.json";

// If modifying these scopes, delete token.json.
//The first scope, https://www.googleapis.com/auth/drive.readonly, is necessary
//to have permissions to access the files' contents, not only the metadata
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/drive.metadata.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.

//An oAuth2 object is returned from authorize() when the authorization is successful,
//and is then passed into many of the functions to be able to interact with google drive files.
//We will store it here when the callback from authorize happens, so the other functions
//can have access to it rather than having to authorize for each operation
var oAuth2Object;
var wasInitialized = false;

// Load client secrets from a local file.
// This is the initialization process.
fs.readFile(CREDENTIALS_PATH, (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Drive API.
  authorize(JSON.parse(content), function(auth)
  {
    //Initialization finished here
    oAuth2Object = auth;
    wasInitialized = true;
    console.log("Google Drive API initialized.");
  });
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listFiles(auth) {
  const drive = google.drive({version: 'v3', auth});
  drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const files = res.data.files;
    if (files.length) {
      console.log('Files:');
      files.map((file) => {
        console.log(`${file.name} (${file.id})`);
      });
    } else {
      console.log('No files found.');
    }
  });
}

//Modified from downloadFile to return a buffer, rather than directly pipe a writestream into a directory
//fileId is the fileId that can be found in the Get Shareable Link option of the google drive website when right clicking a file
//The link itself contains the ID
module.exports.getFileBuffer = function(fileId, callback)
{
  //added to make sure the initialization of authorize() finished before handling requests
  if (wasInitialized === false)
  {
    callback("The module was not initialized properly.");
    return;
  }

  const drive = google.drive({version:"v3", oAuth2Object});

  //auth must be passed as option with the oAuth2 object that was obtained in the initialization
  //with the authorize() function.

  //alt: 'media' tells the api to grab the file's contents, rather than the metadata
  drive.files.get({auth: oAuth2Object, fileId: fileId, alt: 'media'}, {responseType: 'buffer'}, function(err, response)
  {
    if (err)
    {
      callback(err);
      return;
    }

    //Buffer.from() must be used, as the returned response.data is a buffer string,
    //not an actual Buffer object type with all of its supporting functions
    callback(null, Buffer.from(response.data));
  });
};

//fileId is the fileId that can be found in the Get Shareable Link option of the
//google drive website when right clicking a file the link itself contains the ID
module.exports.getFileStream = function(fileId, path, callback)
{
  //added to make sure the initialization of authorize() finished before handling requests
  if (wasInitialized === false)
  {
    callback("The module was not initialized properly.");
    return;
  }

  const drive = google.drive({version:"v3", oAuth2Object});
  //let dest = fs.createWriteStream(path);

  //auth must be passed as option with the oAuth2 object that was obtained in the initialization
  //with the authorize() function.

  //alt: 'media' tells the api to grab the file's contents, rather than the metadata
  drive.files.get({auth: oAuth2Object, fileId: fileId, alt: 'media'}, {responseType: 'stream'}, function(err, response)
  {
    if (err)
    {
      callback(err);
      return;
    }

    callback(null, response.data);
  });
};

//Custom function taken from https://medium.com/@humadvii/downloading-files-from-google-drive-using-node-js-3704c142a5f6
//Directly downloads the file into the given path using a WriteStream (specified in responseType)
//fileId is the fileId that can be found in the Get Shareable Link option of the google drive website when right clicking a file
//The link itself contains the ID
module.exports.downloadFile = function(fileId, downloadPath, callback)
{
  //added to make sure the initialization of authorize() finished before handling requests
  if (wasInitialized === false)
  {
    callback("The module was not initialized properly.");
    return;
  }

  const drive = google.drive({version:"v3", oAuth2Object});
  var dest = fs.createWriteStream(downloadPath);

  //get file as a stream, then
  //auth must be passed as option with the oAuth2 object that was obtained in the initialization
  //with the authorize() function.

  //alt: 'media' tells google to grab the file's contents, rather than the metadata

  //responseType must be marked as stream as well to be able to pipe it
  //and use events on it. A callback is also required, unlike what the google example at
  //https://developers.google.com/drive/api/v3/manage-downloads shows
  drive.files.get({auth: oAuth2Object, fileId: fileId, alt: 'media'}, {responseType: 'stream'}, function(err, response)
  {
    /*err.response has the following fields:
    {
      "status": 404,
      "statusText": "Not Found",
      "data": "Not Found"
    }
    */
    if (err)
    {
      callback(err);
      return;
    }

    response.data
    .on('error', err => {
        callback(err);
    })
    .on('end', () => {
        callback();
    })
    .pipe(dest);
  });
};

//Metadata reference: https://developers.google.com/drive/api/v3/reference/files
//fileId is the fileId that can be found in the Get Shareable Link option of the google drive website when right clicking a file
//The link itself contains the ID
module.exports.getFileMetadata = function(fileId, fields, callback)
{
  //added to make sure the initialization of authorize() finished before handling requests
  if (wasInitialized === false)
  {
    callback("The module was not initialized properly.");
    return;
  }

  const drive = google.drive({version:"v3", oAuth2Object});

  //if fields is not specified or is not a string, default to basic metadata information,
  //like the file name, the extension, its size
  if (typeof fields !== "string")
  {
    fields = "id,name,fileExtension,size";
  }

  //auth must be passed as option with the oAuth2 object that was obtained in the initialization
  //with the authorize() function.
  drive.files.get({auth: oAuth2Object, fileId: fileId, fields: fields}, {responseType: 'json'}, function(err, response)
  {
    /*err.response has the following fields:
    {
      "status": 404,
      "statusText": "Not Found",
      "data": "Not Found"
    }*/
    if (err)
    {
      callback(err.response);
      return;
    }

    callback(null, response.data);
  });
};
