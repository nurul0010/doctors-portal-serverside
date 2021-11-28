const admin = require("firebase-admin");
const express = require('express');
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const app = express();

// 

// middleware
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 7000;



const serviceAccount = require('./doctors-portal-firebase-adminsdk.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hr9du.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

// console.log(uri);

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch {

        }

    }
    next();
}

async function run() {
    try {
        await client.connect();
        const database = client.db("doctorsPortal");
        const appointmentCollections = database.collection("appointments");
        const userInfoCollections = database.collection("usersInfo");

        // post appointments 
        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            const result = await appointmentCollections.insertOne(appointment);

            res.json(result);
        });

        // get appointments filtering by email 

        app.get('/appointments', async (req, res) => {
            const email = req.query.email;
            const date = new Date(req.query.date).toLocaleDateString();
            // console.log(date);
            const query = { email: email, date: date };
            // console.log(query);

            const cursor = appointmentCollections.find(query);
            const result = await cursor.toArray();

            res.json(result);
        });

        // find admin by sending a email 

        app.get('/userInfo/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await userInfoCollections.findOne(query);
            // console.log(result);
            let isAdmin = false;
            if (result?.role === 'admin') {
                isAdmin = true;
            }

            res.json({ admin: isAdmin });
        });

        // get single appointment by id 

        app.get(`/appointments/:id`, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentCollections.findOne(query);

            res.json(result);
        })

        // post/save your user information 

        app.post('/userInfo', async (req, res) => {
            const userInfo = req.body;
            const result = await userInfoCollections.insertOne(userInfo);

            res.send(result);
        });

        // upsert user for google sign in btn 

        app.put('/userInfo', async (req, res) => {
            const userInfo = req.body;
            const filter = { email: userInfo.email };
            const options = { upsert: true };
            const updateDoc = {
                $set: userInfo,
            };
            const result = await userInfoCollections.updateOne(filter, updateDoc, options);

            res.json(result);
        });

        // set roll admin to userinfo 
        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await userInfoCollections.findOne({ email: requester });
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            }
            else {
                res.status(403).json({ message: 'you do not have access to make admin' })
            }

        });

        // api for getting payment 

        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            console.log(req.body);
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card']
            });
            res.json({ clientSecret: paymentIntent.client_secret })
        });



    } finally {
        //   await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('running backend')
});

app.listen(port, () => {
    console.log('listening to port', port)
})