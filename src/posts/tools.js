'use strict';

const privileges = require('../privileges');

module.exports = function (Posts) {
    Posts.tools = {};

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

        await Topics.setTopicField(pid, 'pinExpiry', expiry);
        plugins.hooks.fire('action:topic.setPinExpiry', { post: _.clone(postData), uid: uid });
    };

    Posts.tools.checkPinExpiry = async (pids) => {
        const expiry = (await posts.getPostsFields(pids, ['pinExpiry'])).map(obj => obj.pinExpiry);
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
