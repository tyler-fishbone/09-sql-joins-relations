'use strict';

const pg = require('pg');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const PORT = process.env.PORT || 3000;
const app = express();

const conString = 'postgres://localhost:5432/articles';
const client = new pg.Client(conString);
client.connect();
client.on('error', error => {
  console.error(error);
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static('./public'));

// REVIEW-DONE: These are routes for requesting HTML resources.
app.get('/new', (request, response) => {
  response.sendFile('new.html', {root: './public'});
});

// REVIEW-DONE: These are routes for making API calls to enact CRUD operations on our database.
// LAB-DONE - Write a SQL query to join all data from articles and authors tables on the author_id value of each when the articles are retrieved.
app.get('/articles', (request, response) => {
  client.query(`SELECT * FROM articles INNER JOIN authors ON articles.author_id = authors.author_id;`)
    .then(result => {
      response.send(result.rows);
    })
    .catch(err => {
      console.error(err)
    });
});

// LAB-DONE - Write a SQL query to create a new article.
// Insert an author and pass the author and authorUrl as data for the query. On conflict, do nothing.
app.post('/articles', (request, response) => {
  client.query(
    'INSERT INTO authors(author, "authorUrl") VALUES ($1, $2) ON CONFLICT DO NOTHING;',
    [request.body.author, request.body.authorUrl],
    function(err) {
      if (err) console.error(err);
      // REVIEW: This is our second query, to be executed when this first query is complete.
      queryTwo();
    }
  )

  // LAB - In the second query, add the SQL commands to retrieve a single author from the authors table. Add the author name as data for the query.
  function queryTwo() {
    // come back to this, mad fuzzy
    client.query(
      `SELECT author_id FROM authors WHERE author=$1;`,
      [request.body.author],
      function(err, result) {
        if (err) console.error(err);

        // REVIEW: This is our third query, to be executed when the second is complete. We are also passing the author_id into our third query.
        queryThree(result.rows[0].author_id);
      }
    )
  }

  // LAB -DONE- In the third query, add the SQL commands to insert the new article using the author_id from the second query. Add the data from the new article, including the author_id, as data for the SQL query.
  function queryThree(author_id) {
    client.query(
      `INSERT INTO articles(author_id, title, category, "publishedOn", body) VALUES ($1, $2, $3, $4, $5);
       `,
      [author_id,
        request.body.title,
        request.body.category,
        request.body.publishedOn,
        request.body.body],
      function(err) {
        if (err) console.error(err);
        response.send('insert complete');
      }
    );
  }
});

/* DONE....?
Write a SQL query to update an author record and article record.
- Remember that the articles now have an author_id property, so we can reference it from the request.body. Add the required values from the request as data for the SQL query to interpolate.
- After the author has been updated, you will then need to update an article record. Remember that the article records now have an author_id, in addition to title, category, publishedOn, and body. Add the required values from the request as data for the SQL query to interpolate.
*/
app.put('/articles/:id', function(request, response) {
  client.query(
    `UPDATE authors SET author=$1, "authorUrl"=$2 WHERE author_id=$3;`,
    [request.body.author,
      request.body.authorUrl,
      request.body.author_id]
  )
    .then(() => {
      client.query(
        `UPDATE articles SET title=$1, category=$2, "publishedOn"=$3, body=$4 WHERE author_id=$5;`,
        [request.body.title,
          request.body.category,
          request.body.publishedOn,
          request.body.body,
          request.body.author_id]
      )
    })
    .then(() => {
      response.send('Update complete');
    })
    .catch(err => {
      console.error(err);
    })
});

app.delete('/articles/:id', (request, response) => {
  client.query(
    `DELETE FROM articles WHERE article_id=$1;`,
    [request.params.id]
  )
    .then(() => {
      response.send('Delete complete');
    })
    .catch(err => {
      console.error(err)
    });
});

app.delete('/articles', (request, response) => {
  client.query('DELETE FROM articles')
    .then(() => {
      response.send('Delete complete');
    })
    .catch(err => {
      console.error(err)
    });
});

// REVIEW: This calls the loadDB() function, defined below.
loadDB();

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}!`);
});


//////// ** DATABASE LOADERS ** ////////
////////////////////////////////////////

// REVIEW: This helper function will load authors into the DB if the DB is empty.
function loadAuthors() {
  fs.readFile('./public/data/hackerIpsum.json', 'utf8', (err, fd) => {
    JSON.parse(fd).forEach(ele => {
      client.query(
        'INSERT INTO authors(author, "authorUrl") VALUES($1, $2) ON CONFLICT DO NOTHING',
        [ele.author, ele.authorUrl]
      )
    })
  })
}

// REVIEW: This helper function will load articles into the DB if the DB is empty.
function loadArticles() {
  client.query('SELECT COUNT(*) FROM articles')
    .then(result => {
      if(!parseInt(result.rows[0].count)) {
        fs.readFile('./public/data/hackerIpsum.json', 'utf8', (err, fd) => {
          JSON.parse(fd).forEach(ele => {
            client.query(`
            INSERT INTO
            articles(author_id, title, category, "publishedOn", body)
            SELECT author_id, $1, $2, $3, $4
            FROM authors
            WHERE author=$5;
            `,
            [ele.title, ele.category, ele.publishedOn, ele.body, ele.author]
            )
          })
        })
      }
    })
}

// REVIEW: Below are two queries, wrapped in the loadDB() function, which create separate tables in our DB, and create a relationship between the authors and articles tables.
// THEN they load their respective data from our JSON file.
function loadDB() {
  client.query(`
    CREATE TABLE IF NOT EXISTS
    authors (
      author_id SERIAL PRIMARY KEY,
      author VARCHAR(255) UNIQUE NOT NULL,
      "authorUrl" VARCHAR (255)
    );`
  )
    .then(data => {
      loadAuthors(data);
    })
    .catch(err => {
      console.error(err)
    });

  client.query(`
    CREATE TABLE IF NOT EXISTS
    articles (
      article_id SERIAL PRIMARY KEY,
      author_id INTEGER NOT NULL REFERENCES authors(author_id),
      title VARCHAR(255) NOT NULL,
      category VARCHAR(20),
      "publishedOn" DATE,
      body TEXT NOT NULL
    );`
  )
    .then(data => {
      loadArticles(data);
    })
    .catch(err => {
      console.error(err)
    });
}
