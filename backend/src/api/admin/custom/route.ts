import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import multer from "multer"

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
})

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  res.sendStatus(200)
}

export const POST = [
  upload.array("files"),
  async (req: MedusaRequest, res: MedusaResponse) => {
    const files = (req as any).files

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    const fileModuleService = req.scope.resolve("fileModuleService") as any

    const uploads = await Promise.all(
      files.map((file: any) =>
        fileModuleService.upload({
          filename: file.originalname,
          mimeType: file.mimetype,
          content: file.buffer,
        })
      )
    )

    res.json({
      files: uploads,
    })
  },
]