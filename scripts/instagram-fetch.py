
#!/usr/bin/env python3

import json
import re
import sys

from curl_cffi import requests


def find_posts(value):
    if isinstance(value, dict):
        connection = value.get("polaris_ordered_timeline_connection")
        if isinstance(connection, dict):
            edges = connection.get("edges", [])
            if edges:
                return [edge.get("node", {}) for edge in edges]

        for child in value.values():
            result = find_posts(child)
            if result:
                return result

    elif isinstance(value, list):
        for child in value:
            result = find_posts(child)
            if result:
                return result

    return []


def main():
    username = sys.argv[1] if len(sys.argv) > 1 else "sukura_kl"

    response = requests.get(
        f"https://www.instagram.com/{username}/",
        impersonate="chrome",
        timeout=30,
    )
    response.raise_for_status()

    html = response.text

    # Extract the total post count from Instagram's profile metadata.
    description_match = re.search(
        r'<meta\s+property="og:description"\s+content="([^"]*)"',
        html,
        re.IGNORECASE,
    )

    post_count = None

    if description_match:
        count_match = re.search(
            r'([\d,.\s]+)\s+Posts\b',
            description_match.group(1),
            re.IGNORECASE,
        )
        if count_match:
            post_count = int(re.sub(r"\D", "", count_match.group(1)))

    scripts = re.findall(
        r'<script[^>]*type="application/json"[^>]*>(.*?)</script>',
        html,
        re.DOTALL,
    )

    posts = []

    for script in scripts:
        try:
            payload = json.loads(script)
        except json.JSONDecodeError:
            continue

        posts = find_posts(payload)

        if posts:
            break

    if not posts:
        raise RuntimeError("Instagram posts not found in profile HTML")

    result = {
        "user": {
            "username": username,
            "all_media_count": post_count,
        },
        "posts": [
            {
                "id": post.get("pk") or post.get("id"),
                "code": post.get("code"),
                "display_url": post.get("display_uri", ""),
                "caption": (
                    post.get("caption", {}).get("text", "")
                    if isinstance(post.get("caption"), dict)
                    else ""
                ),
                "is_video": post.get("is_video", False),
                "timestamp": "",
            }
            for post in posts[:4]
        ],
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()