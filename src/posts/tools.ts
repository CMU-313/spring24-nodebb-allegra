'use strict';

import { PostObjectNew, PostResult, PostsFunctions } from "./data.js";
import { dataObj } from './data.js'
const plugins = require('../plugins');
const privileges = require('../privileges');
const db = require('../database');


export = function (Posts: PostsFunctions) {
    Posts.tools.delete = async function (uid, pid) {
        return await togglePostDelete(uid, pid, true);
    };

    Posts.tools.restore = async function (uid, pid) {
        return await togglePostDelete(uid, pid, false);
    };

    async function togglePostDelete(uid, pid, isDelete) {
        const [postData, canDelete] = await Promise.all([
            Posts.getPostData(pid),
            privileges.posts.canDelete(pid, uid),
        ]);
        if (!postData) {
            throw new Error('[[error:no-post]]');
        }

        if (postData.deleted && isDelete) {
            throw new Error('[[error:post-already-deleted]]');
        } else if (!postData.deleted && !isDelete) {
            throw new Error('[[error:post-already-restored]]');
        }

        if (!canDelete.flag) {
            throw new Error(canDelete.message);
        }
        let post;
        if (isDelete) {
            require('./cache').del(pid);
            post = await Posts.delete(pid, uid);
        } else {
            post = await Posts.restore(pid, uid);
            post = await Posts.parsePost(post);
        }
        return post;
    };

    Posts.tools.setPinExpiry = async (pid, expiry, uid) => {
        if (isNaN(parseInt(expiry, 10)) || expiry <= Date.now()) {
            throw new Error('[[error:invalid-data]]');
        }

        const postData = await Posts.getPostFields(pid, ['pid', 'uid', 'cid']);
        const isAdminOrMod = await privileges.categories.isAdminOrMod(postData.cid, uid);
        if (!isAdminOrMod) {
            throw new Error('[[error:no-privileges]]');
        }

        await Posts.setPostFieldWithValue(pid, 'pinExpiry', expiry);
        plugins.hooks.fire('action:topic.setPinExpiry', { post: _.clone(postData), uid: uid });
    };

    Posts.tools.checkPinExpiry = async (pids) => {
        const expiry = (await Posts.getPostsFields(pids, ['pinExpiry'])).map(obj => obj.pinExpiry);
        const now = Date.now();

        pids = await Promise.all(pids.map(async (pid, idx) => {
            if (expiry[idx] && parseInt(expiry[idx], 10) <= now) {
                await togglePin(pid, 'system', false);
                return null;
            }

            return pid;
        }));

        return pids.filter(Boolean);
    };

    async function togglePin(pid: number, uid: string, pin: boolean) {
        const postData : PostObjectNew = await Posts.getPostData(pid);
        if (!postData) {
            throw new Error('[[error:no-topic]]');
        }

        if (postData.scheduled) {
            throw new Error('[[error:cant-pin-scheduled]]');
        }

        const canPin = await privileges.global.can('pin:topics', uid);
        if (uid !== 'system' && !canPin) {
            throw new Error('[[error:no-privileges]]');
        }

        const promises = [
            Posts.setPostFieldWithValue(pid, 'pinned', pin ? 1 : 0),
            // Posts.events.log(pid, { type: pin ? 'pin' : 'unpin', uid }),
        ];
        if (pin) {
            promises.push(db.sortedSetAdd(`cid:${postData.cid}:pids:pinned`, Date.now(), pid));
            promises.push(db.sortedSetsRemove([
                `cid:${postData.cid}:pids`,
                `cid:${postData.cid}:pids:posts`,
                `cid:${postData.cid}:pids:votes`,
                `cid:${postData.cid}:pids:views`,
            ], pid));
        } else {
            promises.push(db.sortedSetRemove(`cid:${postData.cid}:tids:pinned`, pid));
            promises.push(Posts.deleteTopicField(pid, 'pinExpiry'));
            promises.push(db.sortedSetAddBulk([
                [`cid:${postData.cid}:pids`, postData.lastposttime, pid],
                [`cid:${postData.cid}:pids:posts`, postData.postcount, pid],
                [`cid:${postData.cid}:pids:votes`, postData.votes, 10, pid],
                [`cid:${postData.cid}:pids:views`, postData.viewcount, pid],
            ]));
            postData.pinExpiry = undefined;
            postData.pinExpiryISO = undefined;
        }

        const results = await Promise.all(promises);

        postData.isPinned = pin; // deprecate in v2.0
        postData.pinned = pin;
        postData.events = results[1];

        plugins.hooks.fire('action:topic.pin', { topic: _.clone(postData), uid });

        return postData;
    }
};
