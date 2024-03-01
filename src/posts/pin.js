'use strict';

const db = require('../database');
const plugins = require('../plugins');

module.exports = function (Posts) {
    Posts.pin = async function (pid, postPinDuration, postData) {
        const promises = [
            Posts.setPostField(pid, 'pinned', 1),
            Posts.events.log(pid, { type: 'pin' }),
        ];

        promises.push(db.sortedSetAdd(`cid:${postData.cid}:pids:pinned`, Date.now(), pid));
        promises.push(db.sortedSetsRemove([
            `cid:${postData.cid}:pids`,
            `cid:${postData.cid}:pids:posts`,
            `cid:${postData.cid}:pids:votes`,
            `cid:${postData.cid}:pids:views`,
        ], pid));

        const results = await Promise.all(promises);
        postData.isPinned = 1;
        postData.pinned = 1;
        postData.events = results[1];

        plugins.hooks.fire('action:post.pin', { postData });
        return postData;
    };
};
