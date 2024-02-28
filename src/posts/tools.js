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
    }

    async function togglePostPin(pid, isPinned, postPinDuration){
        const post = await Posts.getPostData(pid);
        if (!post) {
            throw new Error('[[error:no-post]]');
        }

        if (isPinned && post.pinned) {
            throw new Error('[[error:post-already-pinned]]');
        } else if (!isPinned && !post.pinned) {
            throw new Error('[[error:post-already-unpinned]]');
        }

        if (isPinned) {
            return await Posts.pin(pid, postPinDuration);
        } else {
            return await Posts.unpin(pid);
        }
    }
};
