import { NextFunction, Request, Response } from "express"
import { Logger } from "./logger"

export function safeMid(logger: Logger): Function {
    return function (f: Function): Function {
        return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
            try {
                await f(req, res, next)
            } catch (e) {
                logger.err(e.message)
                res.sendStatus(500)
                next()
            }
        }
    }
}