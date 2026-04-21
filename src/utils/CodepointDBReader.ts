//import * as SQL from 'sql.js';
const initSqlJs = require("./sql-wasm.js");
//const wasmthing = require('./sql-wasm.wasm');
/**
 * This class is not used in production, but is useful for testing and debugging.
 * It allows you to read the codepoint database from a URL and query it for postcodes.
 * It was not feasible to extend this to UPRN data due to the size of the database.
 */
export default class CodepointSQL {
  private db;
  private sql_lib;
  private postcodeStmt;
  private initialized = false;

  private constructor(db: any, sql: any) {
    this.db = db;
    this.sql_lib = sql;
    try {
      this.postcodeStmt = this.db.prepare(
        "SELECT postcode, longitude, latitude FROM codepoint_4326 WHERE postcode IN (':PC')"
      );
      this.initialized = true;
    } catch (e) {
      console.log("Failed to open codepoint database");
    }
  }

  static async CodepointReader(db_url: string) {
    const sqlPromise = initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
    const dataPromise = fetch(db_url).then((res) => res.arrayBuffer());
    const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
    const db = new SQL.Database(new Uint8Array(buf));
    return new CodepointSQL(db, SQL);
  }

  public getMultiplePostcodes(postcodes: string[]): any {
    // this is a bit hacky, we should use bound statements to be safe, need to sort this if using this code in production.
    // As this is only an in-memory db with no client access, it's probably fine though
    const formattingMap = {};
    const concat = postcodes
      .map((p) => {
        const formatted = p.replace(/\s/g, "").toUpperCase();
        formattingMap[formatted] = p;
        return '"' + formatted + '"';
      })
      .join(",");
    let results = {};
    this.db.each(
      "SELECT postcode,longitude,latitude FROM codepoint_4326 WHERE postcode IN(" +
        concat +
        ")",
      {},
      function (row) {
        results[formattingMap[row.postcode]] = [row.longitude, row.latitude];
      }
    );
    return results;
  }

  public getValueBind(postcodes: string[]): any {
    // can't get this working, too much quotes and escaping
    const concat = postcodes.map((p) => '"' + p + '"').join(",");
    //const concat = postcodes.join()
    //this.postcodeStmt.reset();
    this.postcodeStmt.bind({ ":PC": postcodes });
    let results = {};
    while (this.postcodeStmt.step()) {
      const res = this.postcodeStmt.getAsObject();
      results[res.postcode] = [res.longitude, res.latitude];
    }
    this.postcodeStmt.reset();
    return results;
    // const res = this.postcodeStmt.getAsObject({':PC': concat});
    // return res as {
    //     postcode: string,
    //     longitude: number,
    //     latitude: number
    // }
  }
}
