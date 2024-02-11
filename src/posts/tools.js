"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const lodash_1 = __importDefault(require("lodash"));
const cache = require("./cache");
const plugins = require("../plugins");
const privileges = require("../privileges");
const db = require("../database");
module.exports = function (Posts) {
    function togglePostDelete(uid, pid, isDelete) {
        return __awaiter(this, void 0, void 0, function* () {
            const [postData, canDelete] = yield Promise.all([
                Posts.getPostData(pid),
                privileges.posts.canDelete(pid, uid),
            ]);
            if (!postData) {
                throw new Error('[[error:no-post]]');
            }
            if (postData.deleted && isDelete) {
                throw new Error('[[error:post-already-deleted]]');
            }
            else if (!postData.deleted && !isDelete) {
                throw new Error('[[error:post-already-restored]]');
            }
            if (!canDelete.flag) {
                throw new Error(canDelete.message);
            }
            let post;
            if (isDelete) {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                cache.del(pid);
                post = yield Posts.delete(pid, uid);
            }
            else {
                post = yield Posts.restore(pid, uid);
                post = yield Posts.parsePost(post);
            }
            return post;
        });
    }
    Posts.tools.delete = function (uid, pid) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield togglePostDelete(uid, pid, true);
        });
    };
    Posts.tools.restore = function (uid, pid) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield togglePostDelete(uid, pid, false);
        });
    };
    Posts.tools.setPinExpiry = (pid, expiry, uid) => __awaiter(this, void 0, void 0, function* () {
        if (typeof expiry === 'string') {
            const expiryStr = expiry;
            if (isNaN(parseInt(expiryStr, 10))) {
                throw new Error('[[error:invalid-data]]');
            }
        }
        else {
            const expiryNum = expiry;
            if (expiryNum <= Date.now()) {
                throw new Error('[[error:invalid-data]]');
            }
        }
        const postData = yield Posts.getPostFields(pid, ['pid', 'uid', 'cid']);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const isAdminOrMod = yield privileges.categories.isAdminOrMod(postData.cid, uid);
        if (!isAdminOrMod) {
            throw new Error('[[error:no-privileges]]');
        }
        yield Posts.setPostFieldWithValue(pid, 'pinExpiry', expiry);
        yield plugins.hooks.fire('action:post.setPinExpiry', { post: lodash_1.default.clone(postData), uid: uid });
    });
    function togglePin(pid, uid, pin) {
        return __awaiter(this, void 0, void 0, function* () {
            const postData = yield Posts.getPostData(pid);
            if (!postData) {
                throw new Error('[[error:no-post]]');
            }
            if (postData.scheduled) {
                throw new Error('[[error:cant-pin-scheduled]]');
            }
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const canPin = yield privileges.global.can('pin:posts', uid);
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
            }
            else {
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
            const results = yield Promise.all(promises);
            postData.isPinned = pin; // deprecate in v2.0
            postData.pinned = pin;
            postData.events = results[1];
            yield plugins.hooks.fire('action:post.pin', { post: lodash_1.default.clone(postData), uid });
            return postData;
        });
    }
    Posts.tools.checkPinExpiry = (pids) => __awaiter(this, void 0, void 0, function* () {
        const expiry = (yield Posts.getPostsFields(pids, ['pinExpiry'])).map(obj => obj.pinExpiry);
        const now = Date.now();
        pids = yield Promise.all(pids.map((pid, idx) => __awaiter(this, void 0, void 0, function* () {
            if (expiry[idx] && parseInt(expiry[idx], 10) <= now) {
                yield togglePin(pid, 'system', false);
                return null;
            }
            return pid;
        })));
        return pids.filter(Boolean);
    });
};
