'use strict';

const db = require('../database');

module.exports = function (Posts) {
    async function pin(pid, postPinDuration, postData) {
        const promises = [
            Posts.setPostField(pid, 'pinned', 1),
            Posts.events.log(pid, { type : 'pin'})
        ];

        promises.push(db.sortedSetAdd(`cid:${postData.cid}:pids:pinned`, Date.now(), pid));
        promises.push(db.sortedSetsRemove([
            `cid:${postData.cid}:pids`,
            `cid:${postData.cid}:pids:posts`,
            `cid:${postData.cid}:pids:votes`,
            `cid:${postData.cid}:pids:views`
        ], pid));

        const results = await Promise.all(promises);
        postData.isPinned = pin;
        postData.pinned = pin;
        postData.events = results[1]

        plugins.hooks.fire('action:post.pin', { topic: _.clone(postData), uid });
        return postData;
    }
}
