import wrapper from '@votton/api-wrapper';
import * as dotenv from 'dotenv';
dotenv.config();

// Create a wrapper for the xenforo api
const xenforo = wrapper.create({
  root: process.env.XF_URL + '/api/',
  parseJson: true,
  requestDefaults: {
    headers: { 'XF-Api-Key': process.env.XF_API_KEY },
  },
  get: {
    getThreads: 'threads/',
    getThread: 'threads/${id}/',
    getUser: 'users/${id}/',
    getForum: 'forums/${id}/threads/',
    getMessage: 'posts/${id}/',
  },
  post: {
    postMessage: 'posts/?thread_id|message',
    updateThread: 'threads/${id}/?prefix_id|title|discussion_open|sticky|custom_fields|add_tags|remove_tags',
    setThreadTag: 'threads/${id}/?custom_fields[${tag_name}]=${tag_value}',
  },
});

export default xenforo;
