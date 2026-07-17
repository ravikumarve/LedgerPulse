declare module "multer" {
  import { Request, RequestHandler } from "express";

  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }

  interface FileFilterCallback {
    (error: Error | null, acceptFile: boolean): void;
  }

  interface Options {
    dest?: string;
    storage?: StorageEngine;
    fileFilter?(req: Request, file: File, callback: FileFilterCallback): void;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
  }

  interface StorageEngine {
    _handleFile(
      req: Request,
      file: File,
      callback: (error?: Error | null, info?: Partial<File>) => void
    ): void;
    _removeFile(req: Request, file: File, callback: (error: Error | null) => void): void;
  }

  interface DiskStorageOptions {
    destination?:
      | string
      | ((
          req: Request,
          file: File,
          callback: (error: Error | null, destination: string) => void
        ) => void);
    filename?:
      | ((
          req: Request,
          file: File,
          callback: (error: Error | null, filename: string) => void
        ) => void);
  }

  interface MulterInstance {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: { name: string; maxCount?: number }[]): RequestHandler;
    none(): RequestHandler;
  }

  function multer(options?: Options): MulterInstance;

  namespace multer {
    function diskStorage(options: DiskStorageOptions): StorageEngine;
    type FileFilterCallback = import("./multer").FileFilterCallback;
    type MulterInstance = import("./multer").MulterInstance;
  }

  export = multer;
}
