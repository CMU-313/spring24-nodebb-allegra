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

    Posts.tools.pin = async function (pid, duration) {
        return await togglePostPin(pid, true, duration);
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
    }

    async function togglePostPin(pid, isPinned, postPinDuration) {
        const [postData, canPin] = await Promise.all([
            Posts.getPostData(pid),
            privileges.posts.canPin(pid),
        ]);
        if (!postData) {
            throw new Error('[[error:no-post]]');
        }

        if (isPinned && postData.pinned) {
            throw new Error('[[error:post-already-pinned]]');
        } else if (!isPinned && !postData.pinned) {
            throw new Error('[[error:post-already-unpinned]]');
        }

        if (!canPin.flag) {
            throw new Error(canPin.message);
        }

        let post;
        if (isPinned) {
            post = await Posts.pin(pid, postPinDuration, postData);
        } else {
            post = await Posts.unpin(pid);
        }
        return post;
    }
};
