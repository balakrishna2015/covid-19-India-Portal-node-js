const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();
app.use(express.json());

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server start at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//district converter

const districtColumnConverter = (object) => {
  return {
    districtId: object.district_id,
    districtName: object.district_name,
    stateId: object.state_id,
    cases: object.cases,
    cured: object.cured,
    active: object.active,
    deaths: object.deaths,
  };
};

//state converter
const stateColumnConverter = (object) => {
  return {
    stateId: object.state_id,
    stateName: object.state_name,
    population: object.population,
  };
};

//authentication middleware function
const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const usrIsThere = `
     SELECT * FROM user
     WHERE username = '${username}';`;
  const userFound = await db.get(usrIsThere);

  if (userFound === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const matchPassword = await bcrypt.compare(password, userFound.password);
    if (matchPassword === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// states API
app.get("/states/", authentication, async (request, response) => {
  const statesQuery = `SELECT * FROM state order by state_id;`;
  const states = await db.all(statesQuery);
  response.send(states.map((each) => stateColumnConverter(each)));
});

// state API
app.get("/states/:stateId/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const stateQuery = `SELECT * FROM state WHERE state_id = '${stateId}';`;
  const state = await db.get(stateQuery);
  response.send(stateColumnConverter(state));
});
// create district in district table
app.post("/districts/", authentication, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const districtQuery = `
      INSERT INTO district(district_name, state_id, cases, cured, active, deaths)
      VALUES(
          '${districtName}',
          '${stateId}',
          '${cases}',
          '${cured}',
          '${active}',
          '${deaths}'
      );`;
  await db.run(districtQuery);
  response.send("District Successfully Added");
});

// get district API
app.get(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const districtQuery = `
    SELECT * FROM district
    WHERE district_id = ${districtId};`;
    const district = await db.get(districtQuery);
    response.send(districtColumnConverter(district));
  }
);

// delete API
app.delete(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `
    DELETE FROM district WHERE district_id = ${districtId};`;
    await db.run(deleteQuery);
    response.send("District Removed");
  }
);

// Update API
app.put(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;

    const updateQuery = `
    UPDATE district
    SET
      district_name = '${districtName}',
      state_id = '${stateId}',
      cases ='${cases}',
      cured = '${cured}',
      active = '${active}',
      Deaths = '${deaths}'
    WHERE district_id = '${districtId}';
    `;
    await db.run(updateQuery);
    response.send("District Details Updated");
  }
);

// Statistics API
app.get(
  "/states/:stateId/stats/",
  authentication,
  async (request, response) => {
    const { stateId } = request.params;
    const statsQuery = `
    SELECT 
        sum(cases) AS totalCases,
        SUM(cured) AS totalCured,
        SUM(active) AS totalActive,
        SUM(deaths)  AS totalDeaths
    FROM
        district
    WHERE 
        state_id = ${stateId};
    `;
    const updateStats = await db.get(statsQuery);
    response.send(updateStats);
  }
);

module.exports = app;
