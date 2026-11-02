
require("dotenv").config();

const ExcelJS = require("exceljs");
const { db } = require("./firestore");

async function exportCharacters() {
    try {
        console.log("Obteniendo personajes de Firestore...");

        const snapshot = await db.collection("personajes").get();

        if (snapshot.empty) {
            console.log("No hay personajes en la colección");
            return;
        }

        const characters = snapshot.docs.map(doc => ({
            documentId: doc.id,
            ...doc.data()
        }));

        // Obtener todos los campos existentes
        const fields = [
            "documentId",
            ...new Set(characters.flatMap(character =>
                Object.keys(character)
            ))
        ];

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Personajes");

        // Crear columnas dinámicamente
        worksheet.columns = fields.map(field => ({
            header: field,
            key: field,
            width: Math.max(field.length + 4, 18)
        }));

        // Añadir personajes
        characters.forEach(character => {
            const row = {};

            fields.forEach(field => {
                let value = character[field];

                if (value === undefined || value === null) {
                    value = "";
                } else if (Array.isArray(value) || typeof value === "object") {
                    value = JSON.stringify(value);
                }

                row[field] = value;
            });

            worksheet.addRow(row);
        });

        // Mejorar presentación
        worksheet.getRow(1).font = { bold: true };
        worksheet.views = [{ state: "frozen", ySplit: 1 }];
        worksheet.autoFilter = {
            from: "A1",
            to: worksheet.getRow(1).getCell(fields.length).address
        };

        // Guardar archivo
        await workbook.xlsx.writeFile("personajes.xlsx");

        console.log(`Exportación completada: ${characters.length} personajes`);
        console.log("Archivo generado: personajes.xlsx");

    } catch (error) {
        console.error("Error exportando personajes:", error);
        process.exitCode = 1;
    }
}

exportCharacters();
