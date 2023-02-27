import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();
import sql from './common/db.js';
import xenforo from './common/xenforoWrapper.js';

let appealCache: any[] = [];

if (sql) {
  console.log('Connected to Xenforo database.');
}

// if connection error, log it. Attempt to reconnect every 5 seconds.
sql.on('error', function (err) {
  console.log('Database error: ', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    sql.end();
    console.log('Attempting to reconnect to database...');
    setTimeout(function () {
      sql.connect();
    }, 5000);
  } else {
    throw err;
  }
});

// If connection is lost, attempt to reconnect every 5 seconds.
sql.on('close', function () {
  sql.end();
  console.log('Database connection closed.');
  console.log('Attempting to reconnect to database...');
  setTimeout(function () {
    sql.connect();
  }, 5000);
});

async function getBanAppeals() {
  // Get forum
  xenforo.getForum({ id: process.env.FORUM_NODE_ID }, '', function (_error: any, _message: any, body: any) {
    body.threads.forEach(async function (thread: any) {
      if (thread.prefix_id === 0 && appealCache.includes(thread.thread_id) === false) {
        appealCache.push(thread.thread_id);
        checkBanAppeal(thread.title, thread.thread_id, thread.custom_fields, thread.user_id);
      }
    });
  });
}

async function checkBanAppeal(title: string, threadid: number, _data: any, userid: number) {
  // Get the user's steam ID
  getUserSteamID(userid, async function (steamid: string) {
    getBanOnUser(steamid, async function (banInfo: any) {
      getForumUserBySteamID(banInfo['items'][0]['creator'].identifier, async function (gotIt: any, adminid: number) {
        console.log('Found new appeal from ' + steamid + ' for ' + userid + ' for ban #' + banInfo['items'][0].id + ' by ' + banInfo['items'][0]['creator'].identifier);

        const banDate = new Date(banInfo['items'][0].created_on);
        const unbanDate = new Date(banInfo['items'][0].ends_on);
        const ban_length = banInfo['items'][0].length;
        // Convert ban_length to more readable format (This is in seconds)
        const ban_length_days = Math.floor(ban_length / 86400);
        const ban_length_hours = Math.floor((ban_length % 86400) / 3600);
        const ban_length_minutes = Math.floor(((ban_length % 86400) % 3600) / 60);
        const ban_length_seconds = ((ban_length % 86400) % 3600) % 60;

        // Format the ban length
        let ban_length_formatted = '';
        if (ban_length_days > 0) {
          ban_length_formatted = ban_length_formatted + ban_length_days + ' days ';
        }
        if (ban_length_hours > 0) {
          ban_length_formatted = ban_length_formatted + ban_length_hours + ' hours ';
        }
        if (ban_length_minutes > 0) {
          ban_length_formatted = ban_length_formatted + ban_length_minutes + ' minutes ';
        }
        if (ban_length_seconds > 0) {
          ban_length_formatted = ban_length_formatted + ban_length_seconds + ' seconds ';
        }

        let p = '[B]Ban Information[/B]\n[LIST]';
        p = p + '\n[*][B]Ban ID:[/B] ' + banInfo['items'][0].id;
        p = p + '\n[*][B]Reason:[/B] ' + banInfo['items'][0].reason;
        p = p + '\n[*][B]Length:[/B] ' + ban_length_formatted;
        p = p + '\n[*][B]Date Banned:[/B] ' + banDate;
        p = p + '\n[*][B]Date Unbanned:[/B] ' + unbanDate;
        p = p + '\n[*][B]Banned By:[/B] ' + banInfo['items'][0]['creator'].identifier + ' (' + banInfo['items'][0]['creator'].username + ')';

        p = p + '\n[/LIST]';
        p = escape(p);

        // If the thread title already has steamid in it, don't post it again
        // nor update the thread
        if (title.includes(steamid)) {
          console.log('[BANAPPEAL] Thread already contains steamid, skipping');
        } else {
          xenforo.updateThread(
            {
              id: threadid,
              prefix_id: process.env.FORUM_PREFIX,
              title: title + ' - ' + steamid,
            },
            '',
            function () {
              console.log('[BANAPPEAL] Updated thread title');
            }
          );
          xenforo.postMessage({ thread_id: threadid, message: p }, '', function () {
            console.log('[BANAPPEAL] Posted message to ban appeal');
          });
        }
      });
    });
  });
}

async function getUserSteamID(userid: number, callback: any) {
  const query = "SELECT provider_key FROM xf_user_connected_account WHERE provider = 'steam' AND user_id = ? LIMIT 1";
  const params = [userid];

  // Validate the userIDs
  if (!userid) {
    return callback(new Error('User IDs are missing'));
  }

  sql
    .query(query, params)
    .then(function (result: any) {
      const steamIDs: string[] = [];
      if (result.length > 0) {
        for (let i = 0; i < result.length; i++) {
          if (result[i][0] && result[i][0].provider_key) {
            steamIDs.push(result[i][0].provider_key.toString());
          }
        }
      }
      // Send the SteamIDs back one by one
      steamIDs.forEach(function (steamid: string) {
        callback(steamid);
      });
    })
    .catch(function (err: any) {
      console.log(err);
    });
}

async function getForumUserBySteamID(steamid: string, callback: any) {
  if (!steamid) {
    return callback(new Error('Steam ID is missing'));
  }

  const query = "SELECT user_id FROM xf_user_connected_account WHERE provider = 'steam' AND provider_key = ? LIMIT 1";
  const params = [steamid];

  sql
    .query(query, params)
    .then(function (result: any) {
      if (result.length > 0) {
        callback(result[0].user_id);
      }
    })
    .catch(function (err: any) {
      console.log(err);
    });
}

async function getBanOnUser(steamid: string, callback: any) {
  if (!steamid) {
    return callback(new Error('Steam ID is missing'));
  }

  const sql = 'SELECT * FROM xf_ban WHERE user_id = ? LIMIT 1';
  const params = [steamid];

  const vyhub = await fetch(process.env.VYHUB_API_URL + '/user/' + steamid + '?type=STEAM', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const vyhubUser: any = await vyhub.json();
  // Get the "id" of the user
  const vyhubUserID = vyhubUser.id;

  const vyhubBan: any = await fetch(process.env.VYHUB_API_URL + '/ban/' + '?sort_desc=true&active=true&user_id=' + vyhubUserID + '&page=1&size=50', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.VYHUB_API_KEY,
    },
  });
  const vyhubBanData = await vyhubBan.json();

  // Check that the API key is valid
  if (vyhubBanData.error) {
    return callback(new Error('Invalid API key'));
  }

  if (vyhubBanData['items'].length > 0) {
    callback(vyhubBanData);
  }
}

async function main() {
  getBanAppeals();
  setInterval(getBanAppeals, 5000);
}

main()
  .then(() => {
    console.log('Bot is running.');
  })
  .catch((err) => {
    console.log(err);
  });
