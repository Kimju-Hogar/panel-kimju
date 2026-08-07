const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const URI = 'mongodb+srv://kimjuhogar_db_user:0AFfVlctmFh5FJW3@panelcontabilidad.hgzj0kq.mongodb.net/?appName=PanelContabilidad';
const backupDir = path.join(__dirname, '..', 'db_backup');

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
}

async function backup() {
    try {
        await mongoose.connect(URI);
        console.log('Connected to DB...');
        
        const modelsPath = path.join(__dirname, 'models');
        const models = fs.readdirSync(modelsPath).filter(f => f.endsWith('.js'));
        
        for (const file of models) {
            const modelName = file.replace('.js', '');
            const model = require('./models/' + file);
            const data = await model.find().lean();
            fs.writeFileSync(path.join(backupDir, modelName + '.json'), JSON.stringify(data, null, 2));
            console.log('Backed up ' + modelName + ' (' + data.length + ' records)');
        }
        
        console.log('Backup successful!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
backup();
