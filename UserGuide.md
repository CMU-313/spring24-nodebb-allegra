# User Guide

## Pinning Post Privilege

Hi! This is the user guide for the pinned post privilege.

## Testing

To test this feature, you should start off with creating a regular account, in addition to your already-existing admin account. Check if you can pin topics with the regular account, and the admin one. The initial settings should make it so that regulars cannot pin, and admins can.

You should also add the regular user to the group "Global Moderators", so that they can see the settings bar for topics.

The next step is to go to the admin account, then go to the admin/manage/privileges page (there should be menu buttons for doing this, or you can directly go to the link http://localhost:4567/admin/manage/privileges)

Once there, click "Viewing Privileges", and there will be a way to toggle pin/unpin privileges for certain groups. Click the toggle for Global Moderators (since they can only see topics settings right now), and see if the regular can now pin posts.

If they can, it works! This should in theory work for the rest of the groups as well (including instructors, if you make an instructors group), but currently, other groups cannot see the topics settings bar.

### Automated Tests

There are some automated tests, where they were simply added along with the existing privileges test in the files test/categories.js and test/middleware.js, where the privilege is tested against certain user groups to see if it is available to them or not. These tests are sufficient because we only need to check which groups the pinned post can originally do, and see if they are toggleable.

The GitHub checks should be fine now that I fixed the lints.

## Anonymous Posting

This is in regards to posting anonymously.

## Testing

To test this feature, you should start off by trying to create a post in any of the categories.
When the post composer shows up, there is an **Anonymous** button that you can check. When you check
the button and make a post, your name shouldn't show up and instead a `Guest` icon will show up in
your place.

You should also test if a normal post that isn't _anonymous_ works. To do this, make a normal post
without checking the **Anonymous** box. You should see your name now.

If both conditions are true, then it works! This should work in any category that you make a post in.

### Automated Tests
