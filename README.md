# Xenforo Vyhub Ban Appeal Bot

A simple bot that helps to manage ban appeals on a Xenforo forum.

This is a specific use case, which utilises Vyhub API to check if a player is banned on a specific server and Xenforo API to pass the ban appeal to a specific appeal post.

Originally made by [Vin](https://github.com/vingard/), and now maintained by [Votton](https://github.com/VottonDev)

## Instructions

1. Create a .env file
2. Add the following environment variables to the file:

```
DB_HOST=""
DB_USER=""
DB_PASSWORD=""
DB_NAME=""
VYHUB_API_URL=""
VYHUB_API_KEY=""
XF_URL=""
XF_API_KEY=""
FORUM_NODE_ID=
FORUM_PREFIX=
```

> **VYHUB_API_KEY** should be a dedicated VyHub **API token**, not a personal
> account bearer token (those carry far too much access and expire). Create one
> scoped to only the `ban_show` property so it can read bans across the network and
> nothing else. Via the API:
>
> ```
> curl -X POST "$VYHUB_API_URL/general/api-token" \
>   -H "Authorization: Bearer <admin-bearer-token>" \
>   -H "Content-Type: application/json" \
>   -d '{"name":"Appeal Bot","properties":["ban_show"]}'
> ```
>
> Use the returned `access_token` as `VYHUB_API_KEY`. Leaving out `serverbundle_id`
> grants `ban_show` network-wide, and the token does not expire.

3. Run `npm install`
4. Run `npm run build`
5. Run `npm run start`

This is a fork of my original project that was using GExtension instead, which can be found [here](https://github.com/VottonDev/xenforo-gextension-appealbot).
