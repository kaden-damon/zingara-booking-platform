export const staffIssueMediaBucket = "staff-issue-media";
export const staffIssueMediaMaxFiles = 5;
export const staffIssueMediaMaxFileSize = 25 * 1024 * 1024;
export const staffIssueMediaMaxTotalSize = 50 * 1024 * 1024;
export const staffIssueEmailAttachmentLimit = 8 * 1024 * 1024;

export const staffIssueAllowedMediaTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
] as const;

export type StaffIssueMediaType = (typeof staffIssueAllowedMediaTypes)[number];

export type StaffIssueAttachment = {
  createdAt: string;
  fileSize: number;
  id: string;
  mediaKind: "image" | "video";
  mimeType: StaffIssueMediaType;
  originalFilename: string;
};

export type StaffIssueAttachmentDescriptor = {
  clientId: string;
  fileSize: number;
  mimeType: string;
  originalFilename: string;
};

export type StaffIssueAttachmentUpload = {
  attachmentId: string;
  clientId: string;
  path: string;
  token: string;
};

export function isStaffIssueMediaType(
  value: unknown,
): value is StaffIssueMediaType {
  return staffIssueAllowedMediaTypes.includes(value as StaffIssueMediaType);
}

export function getStaffIssueMediaKind(
  mimeType: StaffIssueMediaType,
): "image" | "video" {
  return mimeType.startsWith("image/") ? "image" : "video";
}

export function formatStaffIssueFileSize(fileSize: number) {
  if (fileSize < 1024 * 1024) {
    return `${Math.max(1, Math.round(fileSize / 1024))} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeStaffIssueFilename(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\\/\0-\x1f\x7f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return normalized || "attachment";
}

export function validateStaffIssueAttachmentDescriptors(
  descriptors: StaffIssueAttachmentDescriptor[],
) {
  if (descriptors.length > staffIssueMediaMaxFiles) {
    return `Attach no more than ${staffIssueMediaMaxFiles} files to one issue.`;
  }

  let totalSize = 0;

  for (const descriptor of descriptors) {
    if (
      !descriptor.clientId?.trim() ||
      !descriptor.originalFilename?.trim() ||
      !Number.isFinite(descriptor.fileSize) ||
      descriptor.fileSize <= 0
    ) {
      return "Every attachment must include a valid filename and file size.";
    }

    if (!isStaffIssueMediaType(descriptor.mimeType)) {
      return `${descriptor.originalFilename} is not a supported image or video format.`;
    }

    if (descriptor.fileSize > staffIssueMediaMaxFileSize) {
      return `${descriptor.originalFilename} exceeds the 25 MB file limit.`;
    }

    totalSize += descriptor.fileSize;
  }

  if (totalSize > staffIssueMediaMaxTotalSize) {
    return "The selected attachments exceed the 50 MB total limit.";
  }

  return null;
}

function matchesAscii(bytes: Uint8Array, offset: number, value: string) {
  return Array.from(value).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

export function detectStaffIssueMediaType(bytes: Uint8Array) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg" as const;
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    matchesAscii(bytes, 1, "PNG") &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png" as const;
  }

  if (
    bytes.length >= 12 &&
    matchesAscii(bytes, 0, "RIFF") &&
    matchesAscii(bytes, 8, "WEBP")
  ) {
    return "image/webp" as const;
  }

  if (bytes.length >= 12 && matchesAscii(bytes, 4, "ftyp")) {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();

    if (brand === "qt  ") {
      return "video/quicktime" as const;
    }

    return "video/mp4" as const;
  }

  return null;
}

export function validateStaffIssueMediaContent(
  bytes: Uint8Array,
  declaredType: StaffIssueMediaType,
) {
  const detectedType = detectStaffIssueMediaType(bytes);

  if (!detectedType) {
    return "The uploaded file content is not a supported image or video.";
  }

  const isIsoVideoPair =
    [detectedType, declaredType].every((type) =>
      ["video/mp4", "video/quicktime"].includes(type),
    );

  if (detectedType !== declaredType && !isIsoVideoPair) {
    return "The uploaded file content does not match its declared media type.";
  }

  return null;
}
