import _ from 'lodash';
import { PostObjectNew, PostsFunctions } from './data';
import cache = require('./cache')

import plugins = require('../plugins');
import privileges = require('../privileges');
import db = require('../database');

export = function (Posts: PostsFunctions) {
    async function togglePostDelete(uid : number, pid : number, isDelete : boolean): Promise<PostObjectNew> {
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
        let post : PostObjectNew;
        if (isDelete) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            cache.del(pid);
            post = await Posts.delete(pid, uid);
        } else {
            post = await Posts.restore(pid, uid);
            post = await Posts.parsePost(post);
        }
        return post;
    }

    Posts.tools.delete = async function (uid : number, pid : number) {
        return await togglePostDelete(uid, pid, true);
    };

    Posts.tools.restore = async function (uid : number, pid : number) {
        return await togglePostDelete(uid, pid, false);
    };

    Posts.tools.setPinExpiry = async (pid : number, expiry : string | number, uid : number) => {
        if (typeof expiry === 'string') {
            const expiryStr = expiry;
            if (isNaN(parseInt(expiryStr, 10))) {
                throw new Error('[[error:invalid-data]]');
            }
        } else {
            const expiryNum = expiry;
            if (expiryNum <= Date.now()) {
                throw new Error('[[error:invalid-data]]');
            }
        }

        const postData = await Posts.getPostFields(pid, ['pid', 'uid', 'cid']);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const isAdminOrMod : boolean = await privileges.categories.isAdminOrMod(postData.cid, uid);
        if (!isAdminOrMod) {
            throw new Error('[[error:no-privileges]]');
        }

        await Posts.setPostFieldWithValue(pid, 'pinExpiry', expiry);
        await plugins.hooks.fire('action:post.setPinExpiry', { post: _.clone(postData), uid: uid });
    };

    async function togglePin(pid: number, uid: string, pin: boolean) {
        const postData : PostObjectNew = await Posts.getPostData(pid);
        if (!postData) {
            throw new Error('[[error:no-post]]');
        }

        if (postData.scheduled) {
            throw new Error('[[error:cant-pin-scheduled]]');
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const canPin = await privileges.global.can('pin:posts', uid);
        if (uid !== 'system' && !canPin) {
            throw new Error('[[error:no-privileges]]');
        }

        const promises = [
            Posts.setPostFieldWithValue(pid, 'pinned', pin ? 1 : 0),
            // Posts.events.log(pid, { type: pin ? 'pin' : 'unpin', uid }),
        ];
        if (pin) {
            // The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
            promises.push(db.sortedSetAdd(`cid:${postData.cid}:pids:pinned`, Date.now(), pid));
            // The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
            promises.push(db.sortedSetsRemove([
                `cid:${postData.cid}:pids`,
                `cid:${postData.cid}:pids:posts`,
                `cid:${postData.cid}:pids:votes`,
                `cid:${postData.cid}:pids:views`,
            ], pid));
        } else {
            // The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-call
            promises.push(db.sortedSetRemove(`cid:${postData.cid}:tids:pinned`, pid));
            promises.push(Posts.deletePostField(pid, 'pinExpiry'));
            // The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
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

        await plugins.hooks.fire('action:post.pin', { post: _.clone(postData), uid });

        return postData;
    }

    Posts.tools.checkPinExpiry = async (pids : Array<number>) => {
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
};
