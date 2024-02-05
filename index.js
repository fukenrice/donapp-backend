const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.createUserData = functions.auth.user().onCreate((user) => {
    const userData = {
        email: user.email,
        nonce: 0
    };

    if (user.displayName) {
        userData.name = user.displayName
    }

    return admin.firestore().collection('users').doc(user.uid).set(userData);
});