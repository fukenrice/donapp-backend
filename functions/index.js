/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Geohash = require("ngeohash");
const express = require("express");
const crypto = require("crypto");

const app = express();

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

admin.initializeApp();

exports.createUserData = functions.auth.user().onCreate((user) => {
  const userData = {
    email: user.email,
  };

  if (user.displayName) {
    userData.name = user.displayName;
  }
  return admin.firestore().collection("users").doc(user.uid).set(userData);
});

exports.createCharity = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const idToken = req.get("Authorization");

    if (!idToken) {
      return res.status(401).json({error: "Unauthorized"});
    }

    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return res.status(401).json({error: "Failed to verify token"});
    }

    if (!req.body || !req.body.charity) {
      return res.status(400).json({error: "Bad request"});
    }

    const charity = req.body.charity;

    if (
      !charity.briefDescription ||
      !charity.campaigns ||
      !charity.creatorid ||
      !charity.description ||
      !charity.fullName ||
      !charity.managerContact ||
      !charity.name ||
      !charity.organization === undefined ||
      (charity.organization && (!charity.egrul || !charity.ogrn)) ||
      !charity.tags
    ) {
      return res.status(400).json({error: "Bad request"});
    }

    const batch = admin.firestore().batch();

    const charityDocRef = admin.firestore().collection("charities").doc();
    const newCharityId = charityDocRef.id;
    batch.set(charityDocRef, {
      id: newCharityId,
      address: charity.address || null,
      briefDescription: charity.briefDescription,
      campaigns: charity.campaigns,
      confirmed: charity.confirmed || false,
      creatorid: charity.creatorid,
      description: charity.description,
      egrul: charity.egrul || "",
      fullName: charity.fullName,
      location: charity.location || null,
      managerContact: charity.managerContact,
      name: charity.name,
      organization: charity.organization,
      ogrn: charity.ogrn || "",
      photourl: charity.photourl || null,
      tags: charity.tags,
      url: charity.url || null,
    });

    if (charity.location) {
      const charityLocationRef = admin.firestore().collection("charitylocations").doc();
      batch.set(charityLocationRef, {
        charityid: newCharityId,
        g: Geohash.encode(charity.location.latitude, charity.location.longitude, 10),
        l: [charity.location.latitude, charity.location.longitude],
      });
    }

    await batch.commit();
    return res.status(200).json({message: "Charity created successfully", charityId: newCharityId});
  } catch (error) {
    console.error("Ошибка при создании Charity:", error);
    return res.status(500).json({error: "Internal error"});
  }
});

exports.updateCharity = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const idToken = req.get("Authorization");
    if (!idToken) {
      return res.status(401).json({error: "Unauthorized"});
    }


    if (!req.body || !req.body.charity) {
      return res.status(400).json({error: "Bad request"});
    }

    const charity = req.body.charity;

    if (
      !charity.id ||
      !charity.briefDescription ||
      !charity.campaigns ||
      !charity.creatorid ||
      !charity.description ||
      !charity.fullName ||
      !charity.managerContact ||
      !charity.name ||
      !charity.organization === undefined ||
      (charity.organization && (!charity.egrul || !charity.ogrn)) ||
      !charity.tags) {
      return res.status(400).json({error: "Bad request"});
    }
    try {
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      if (decodedIdToken.uid !== charity.creatorid) {
        return res.status(403).json({error: "Insufficient permissions"});
      }
    } catch (e) {
      return res.status(401).json({error: "Unauthorized"});
    }

    const prevDoc = await admin.firestore().collection("charities").doc(charity.id).get();
    if (!prevDoc.exists) {
      return res.status(404).json({error: "Charity not found"});
    }
    const prevCharity = prevDoc.data();

    const batch = admin.firestore().batch();

    // есть изменения в локации
    if (JSON.stringify(prevCharity.location) !== JSON.stringify(charity.location)) {
      // не было и появилась или изменилась
      if (charity.location) {
        // изменилась
        if (prevCharity.location) {
          const locSnapshot = await admin.firestore().collection("charitylocations").where("charityid", "==", charity.id).get();
          if (locSnapshot.size !== 0) {
            const locRef = locSnapshot.docs[0].ref;
            batch.update(locRef, {
              g: Geohash.encode(charity.location.latitude, charity.location.longitude, 10),
              l: [charity.location.latitude, charity.location.longitude],
            });
          }
        } else { // появилась
          const charityLocationRef = admin.firestore().collection("charitylocations").doc();
          batch.set(charityLocationRef, {
            charityid: charity.id,
            g: Geohash.encode(charity.location.latitude, charity.location.longitude, 10),
            l: [charity.location.latitude, charity.location.longitude],
          });
        }
      } else { // удалилась
        const locSnapshot = await admin.firestore().collection("charitylocations").where("charityid", "==", charity.id).get();
        if (locSnapshot.size !== 0) {
          const locRef = locSnapshot.docs[0].ref;
          batch.delete(locRef );
        }
      }
    }

    const charityDocRef = admin.firestore().collection("charities").doc(charity.id);
    batch.set(charityDocRef, {
      id: charity.id,
      address: charity.address || null,
      briefDescription: charity.briefDescription,
      campaigns: charity.campaigns,
      confirmed: charity.confirmed || false,
      creatorid: charity.creatorid,
      description: charity.description,
      egrul: charity.egrul || "",
      fullName: charity.fullName,
      location: charity.location || null,
      managerContact: charity.managerContact,
      name: charity.name,
      organization: charity.organization,
      ogrn: charity.ogrn || "",
      photourl: charity.photourl || null,
      tags: charity.tags,
      url: charity.url || null,
    });

    await batch.commit();
    return res.status(200).json({message: "Charity edited successfully", charityId: charity.id});
  } catch (error) {
    console.error("Ошибка при редактировании Charity:", error);
    return res.status(500).json({error: "Internal error"});
  }
});

exports.deleteCharity = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "DELETE") {
      return res.status(405).send("Method Not Allowed");
    }
    if (!req.body || !req.body.charityId) {
      return res.status(400).json({error: "Bad request"});
    }

    const idToken = req.get("Authorization");

    if (!idToken) {
      return res.status(401).json({error: "Unauthorized"});
    }
    const charityId = req.body.charityId;
    const charityDocRef = admin.firestore().collection("charities").doc(charityId);
    const charity = await charityDocRef.get();
    if (!charity.exists) {
      return res.status(404).json({error: "Charity not found"});
    }
    try {
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      if (charity.data().creatorid !== decodedIdToken.uid) {
        return res.status(403).json({error: "Insufficient permissions"});
      }
    } catch (e) {
      return res.status(401).json({error: "Unauthorized"});
    }

    const batch = admin.firestore().batch();
    // Удаление благотворительной организации по ID

    batch.delete(charityDocRef);

    // Удаление всех документов в коллекции charitylocations с условием charityid
    const querySnapshot = await admin.firestore().collection("charitylocations")
        .where("charityid", "==", charityId)
        .get();

    querySnapshot.forEach((doc) => {
      const charityLocationRef = admin.firestore().collection("charitylocations").doc(doc.id);
      batch.delete(charityLocationRef);
    });

    await batch.commit();

    return res.status(200).json({message: "Charity and associated locations deleted successfully"});
  } catch (error) {
    console.error("Error deleting Charity:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});

exports.onNewPost = functions.firestore.document("campaigns/{campaignId}/posts/{postId}")
    .onCreate(async (snapshot, context) => {
      const campaignId = context.params.campaignId;

      const postData = snapshot.data();

      if (postData.finish) {
        await admin.firestore().collection("campaigns").doc(campaignId).update({closed: true});
      }

      // TODO: add notification

      return Promise.resolve();
    });

exports.onNewCampaign = functions.firestore.document("campaigns/{campaignId}")
    .onCreate((snapshot, context) => {
      // TODO: add notification


      return Promise.resolve();
    });

exports.onNewComment = functions.firestore.document("campaigns/{campaignId}/posts/{postId}/comments/{commentId}")
    .onCreate(async (snapshot, context) => {
      const campaignId = context.params.campaignId;
      const postId = context.params.postId;

      await admin.firestore()
          .collection("campaigns").doc(campaignId)
          .collection("posts").doc(postId)
          .update({commentsCount: admin.firestore.FieldValue.increment(1)});

      return Promise.resolve();
    });


exports.createCampaignAndPayment = functions.https.onRequest(async (req, res) => {
  try {
    const idToken = req.get("Authorization");
    if (!idToken) {
      return res.status(401).json({error: "Unauthorized"});
    }
    if (!req.body || !req.body.yoomoney || !req.body.secret) {
      return res.status(400).json({error: "Bad request"});
    }
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return res.status(401).json({error: "Unauthorized"});
    }

    const {yoomoney, secret, ownerId} = req.body;

    let campaignRef;

    const campaignQuerySnapshot = await admin.firestore().collection("campaigns").where("creatorid", "==", ownerId).get();
    if (campaignQuerySnapshot.empty) {
      campaignRef = await admin.firestore().collection("campaigns").add({yoomoney: yoomoney, creatorid: ownerId});
    } else {
      campaignRef = campaignQuerySnapshot.docs[0].ref;
      await campaignRef.set({yoomoney: yoomoney, creatorid: ownerId});
    }

    await campaignRef.collection("private").doc("payment").set({
      secret: secret,
    });

    // Возвращаем id созданного документа в коллекции campaigns
    return res.status(200).json({campaignId: campaignRef.id});
  } catch (error) {
    console.error("Internal error: " + error);
    return res.status(500).json({error: "Internal server error"});
  }
});

/* eslint-disable camelcase */
app.post("/:campaignID", async (req, res) => {
  try {
    const campaignID = req.params.campaignID;
    // Получаем параметры из URL и тела запроса
    const {test_notification, sha1_hash, notification_type, operation_id, amount, currency, datetime, sender, codepro, label} = req.body;

    // Получаем значение notification_secret из коллекции campaigns/{campaignID}/private
    const campaignDoc = await admin.firestore().collection("campaigns").doc(campaignID).get();
    if (!campaignDoc.exists) {
      return res.status(404).json({error: "Campaign not found"});
    }

    const privateDoc = await campaignDoc.ref.collection("private").doc("payment").get();
    if (!privateDoc.exists) {
      return res.status(404).json({error: "Payment data not found in campaign"});
    }

    const {secret: notification_secret} = privateDoc.data();

    // Проверяем значение SHA-1 хэша
    const calculatedHash = crypto.createHash("sha1")
        .update(`${notification_type}&${operation_id}&${amount}&${currency}&${datetime}&${sender}&${codepro}&${notification_secret}&${label}`)
        .digest("hex");

    if (calculatedHash === sha1_hash) {
      if (test_notification && test_notification === "true") {
        await campaignDoc.ref.update({confirmednotifications: true});
        return res.status(200).json({message: "Success"});
      } else {
        await campaignDoc.ref.update({collectedamount: admin.firestore.FieldValue.increment(parseFloat(amount))});
        return res.status(200).json({message: "Success"});
      }
    } else {
      console.log("string: " + `${notification_type}&${operation_id}&${amount}&${currency}&${datetime}&${sender}&${codepro}&${notification_secret}&${label}`);
      console.log("sha_req: " + sha1_hash);
      console.log("calculated hash: " + calculatedHash);
      return res.status(400).json({error: "Wrong SHA-1"});
    }
  } catch (error) {
    console.error("Ошибка обработки уведомления о платеже:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});

exports.updatePayment = functions.https.onRequest(app);

// eslint-disable-next-line no-unused-vars
const sendNotification = async (title, body, sourceId, deeplink) => {

};


exports.getCharityAnalytics = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Method Not Allowed");
    }

    const idToken = req.get("Authorization");
    if (!idToken) {
      return res.status(401).json({error: "Unauthorized"});
    }

    if (!req.query || !req.query.charity) {
      return res.status(400).json({error: "Bad request"});
    }

    const charityId = req.query.charity;

    const charityDocRef = admin.firestore().collection("charities").doc(charityId);
    const charity = await charityDocRef.get();
    if (!charity.exists) {
      return res.status(404).json({error: "Charity not found"});
    }

    const charityData = charity.data();

    try {
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      if (decodedIdToken.uid !== charityData.creatorid) {
        return res.status(403).json({error: "Insufficient permissions"});
      }
    } catch (e) {
      return res.status(401).json({error: "Unauthorized"});
    }

    return res.status(200).json({
      uniqueDonorsOverall: 123,
      uniqueDonorsMonth: 32,
      subscribersStats: {
        month: ["Дек", "Янв", "Фев", "Мар", "Апр", "Май"],
        count: [10, 30, 33, 25, 40, 100],
      },
      collectedAmountStats: {
        month: ["Дек", "Янв", "Фев", "Мар", "Апр", "Май"],
        amount: [15000, 20000, 5000, 5000, 40000, 50000],
      },
    });
  } catch (e) {
    console.error("Error getting stats: ", e);
    return res.status(500).json({error: "Internal server error"});
  }
});


exports.getCampaignAnalytics = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Method Not Allowed");
    }

    const idToken = req.get("Authorization");
    if (!idToken) {
      return res.status(401).json({error: "Unauthorized"});
    }

    if (!req.query || !req.query.campaign) {
      return res.status(400).json({error: "Bad request"});
    }

    const campaignId = req.query.campaign;

    const campaignDocRef = admin.firestore().collection("campaigns").doc(campaignId);
    const campaign = await campaignDocRef.get();
    if (!campaign.exists) {
      return res.status(404).json({error: "Campaign not found"});
    }

    const campaignData = campaign.data();

    const charity = await admin.firestore().collection("charities").doc(campaignData.parentcharity).get();
    const charityData = charity.data();

    try {
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      if (decodedIdToken.uid !== charityData.creatorid) {
        return res.status(403).json({error: "Insufficient permissions"});
      }
    } catch (e) {
      return res.status(401).json({error: "Unauthorized"});
    }

    return res.status(200).json({
      uniqueDonorsOverall: 123,
      uniqueDonorsMonth: 32,
      subscribersStats: {
        month: ["Дек", "Янв", "Фев", "Мар", "Апр", "Май"],
        count: [10, 30, 33, 25, 40, 100],
      },
      collectedAmountStats: {
        month: ["Дек", "Янв", "Фев", "Мар", "Апр", "Май"],
        amount: [15000, 20000, 5000, 5000, 40000, 50000],
      },
    });
  } catch (e) {
    console.error("Error getting stats: ", e);
    return res.status(500).json({error: "Internal server error"});
  }
});
