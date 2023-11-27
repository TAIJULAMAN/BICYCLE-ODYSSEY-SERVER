const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.SECRET_STRIP);

app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.TOKEN, function (err, decoded) {
    if (err) {
      res.status(403).send({ message: "Access Expired" });
    }
    req.decoded = decoded;
    next();
  });
}

const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@bicycle-odyssey.snj10.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const partsCollection = client.db("bicycle_odyssey").collection("parts");
    const orderedCollection = client.db("bicycle_odyssey").collection("orderd");
    const userCollection = client.db("bicycle_odyssey").collection("users");
    const reviewCollection = client.db("bicycle_odyssey").collection("reviews");
    const paymentCollection = client
      .db("bicycle_odyssey")
      .collection("payments");
    const profileCollection = client
      .db("bicycle_odyssey")
      .collection("profiles");
    // get all parts
    app.get("/parts", async (req, res) => {
      const result = await partsCollection.find().toArray();
      res.send(result);
    });
    // stripe
    app.post("/create-payment-intent", async (req, res) => {
      const service = req.body;
      const newPrice = service.totalPrice;
      const amount = newPrice * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // get one tools
    app.get("/parts/:_id", async (req, res) => {
      const _id = req.params._id;
      const query = { _id: ObjectId(_id) };
      const result = await partsCollection.findOne(query);
      res.send(result);
    });
    // update payment
    app.patch("/ordered/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const query = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedOrders = await orderedCollection.updateOne(query, updateDoc);
      const result = await paymentCollection.insertOne(payment);
      res.send(updatedOrders);
    });
    // add order
    app.post("/ordered", async (req, res) => {
      const ordered = req.body;
      const result = await orderedCollection.insertOne(ordered);
      res.send(result);
    });
    app.get("/ordered/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await orderedCollection.findOne(query);
      res.send(order);
    });
    // add profile
    app.post("/profiles", async (req, res) => {
      const profile = req.body;
      const result = await profileCollection.insertOne(profile);
      res.send(result);
    });
    // get user profile
    app.get("/profiles", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await profileCollection.find(query).toArray();
      res.send(result);
    });
    // get logged user orders
    app.get("/ordered", async (req, res) => {
      const email = req.query.email;
      if (email) {
        const query = { email: email };
        const cursor = orderedCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } else {
        const result = await orderedCollection.find().toArray();
        res.send(result);
      }
    });
    // add parts
    app.post("/parts", async (req, res) => {
      const newProduct = req.body;
      const result = await partsCollection.insertOne(newProduct);
      res.send(result);
    });
    // delete parts
    app.delete("/parts/:_id", async (req, res) => {
      const _id = req.params._id;
      const query = { _id: ObjectId(_id) };
      const result = await partsCollection.deleteOne(query);
      res.send(result);
    });
    // add review
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    // delete order
    app.delete("/ordered/:_id", async (req, res) => {
      const _id = req.params._id;
      const query = { _id: ObjectId(_id) };
      const result = await orderedCollection.deleteOne(query);
      res.send(result);
    });
    // update parts
    app.put("/parts/:_id", async (req, res) => {
      const _id = req.params._id;
      const query = { _id: ObjectId(_id) };
      const updatedData = req.body;
      if (updatedData.deliveredQuantity) {
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            quantity: updatedData.deliveredQuantity,
          },
        };
        const result = await partsCollection.updateOne(
          query,
          updateDoc,
          options
        );
        res.send(result);
      }
    });
    // update order
    app.put("/ordered/:_id", async (req, res) => {
      const _id = req.params._id;
      const query = { _id: ObjectId(_id) };
      const updatedData = req.body;
      if (updatedData.delivertext) {
        const updateDoc = {
          $set: {
            deliveredText: updatedData.delivertext,
          },
        };
        const result = await orderedCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    });
    // get users
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    // get reviews
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewCollection.find().toArray();
      res.send(reviews);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send({ result });
      } else {
        res.status(403).send({ message: "Access Denied" });
      }
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      var token = jwt.sign({ email: email }, process.env.TOKEN, {
        expiresIn: "1h",
      });
      res.send({ result, token });
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello bicycle odyssey!");
});

app.listen(port, () => {
  console.log(`bicycle odyssey app listening on port ${port}`);
});
