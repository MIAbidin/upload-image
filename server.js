const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Path = require('path');
const fs = require('fs');
const mysql = require('mysql');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'refooddb'
};

const connection = mysql.createConnection(dbConfig);

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL as id ' + connection.threadId);
});

const init = async () => {
    const server = Hapi.server({
        port: 9000,
        host: 'localhost'
    });

    await server.register(Inert);

    server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => {
            return `<html>
                        <body>
                            <form action="/upload" method="post" enctype="multipart/form-data">
                                <input type="file" name="file" accept="image/*"/>
                                <input type="submit" value="Upload"/>
                            </form>
                        </body>
                    </html>`;
        }
    });

    server.route({
        method: 'POST',
        path: '/upload',
        options: {
            payload: {
                output: 'stream',
                parse: true,
                multipart: true,
                allow: 'multipart/form-data',
                maxBytes: 1024 * 1024 * 5, // 5MB limit
            }
        },
        handler: async (request, h) => {
            const { file } = request.payload;

            if (!file) {
                return h.response('No file uploaded').code(400);
            }

            const filename = file.hapi.filename;
            const fileExtension = filename.split('.').pop().toLowerCase();

            if (fileExtension !== 'png' && fileExtension !== 'jpg' && fileExtension !== 'jpeg') {
                return h.response('Invalid file type').code(400);
            }

            const fileSize = file.hapi.headers['content-length'];

            // Simpan informasi file ke dalam database
            const insertQuery = 'INSERT INTO files (filename, type, size) VALUES (?, ?, ?)';
            const insertValues = [filename, fileExtension, fileSize];

            connection.query(insertQuery, insertValues, (err, result) => {
                if (err) {
                    console.error('Error inserting file info into database: ' + err.stack);
                    return h.response('Error uploading file').code(500);
                }
                console.log('File info inserted into database with ID: ' + result.insertId);
            });

            // Simpan file ke dalam sistem file
            const filePath = Path.join(__dirname, 'uploads', filename);
            const fileStream = fs.createWriteStream(filePath);

            await new Promise((resolve, reject) => {
                file.pipe(fileStream);
                file.on('end', resolve);
                file.on('error', reject);
            });

            return h.response(`File uploaded successfully: ${filename}`).code(200);
        }
    });

    server.route({
        method: 'GET',
        path: '/uploads/{filename}',
        handler: {
            file: (request) => {
                return Path.join(__dirname, 'uploads', request.params.filename);
            }
        }
    });

    await server.start();
    console.log('Server running on %s', server.info.uri);
};

process.on('unhandledRejection', (err) => {
    console.log(err);
    process.exit(1);
});

init();
