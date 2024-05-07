import { REQUEST_TIMEOUT_MS, ServiceProvider } from "@/app/constant";

import { prettyObject } from "@/app/utils/format";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import Locale from "../../locales";
import { ChatOptions, getHeaders, LLMApi, LLMModel, LLMUsage } from "../api";

export class LangChainApi implements LLMApi {
  // fields

  async chat(options: ChatOptions) {
    console.log("sending chat to langchain...");

    const history = options.messages.map((v) => ({
      content: v.content,
    }));

    const requestPayload = {
      input: {
        question: options.messages[history.length - 1].content,
        chat_history: history,
      },
    };

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = "http://localhost:8080/chat/stream_log";
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      let responseText = "";
      let remainText = "";
      let finished = false;

      // animate response to make it looks smooth
      function animateResponseText() {
        if (finished || controller.signal.aborted) {
          responseText += remainText;
          console.log("[Response Animation] finished");
          if (responseText?.length === 0) {
            options.onError?.(new Error("empty response from server"));
          }
          return;
        }

        if (remainText.length > 0) {
          const fetchCount = Math.max(1, Math.round(remainText.length / 60));
          const fetchText = remainText.slice(0, fetchCount);
          responseText += fetchText;
          remainText = remainText.slice(fetchCount);
          options.onUpdate?.(responseText, fetchText);
        }

        requestAnimationFrame(animateResponseText);
      }

      // start animaion
      animateResponseText();

      const finish = () => {
        if (!finished) {
          finished = true;
          options.onFinish(responseText + remainText);
        }
      };

      controller.signal.onabort = finish;

      fetchEventSource(chatPath, {
        ...chatPayload,
        async onopen(res) {
          clearTimeout(requestTimeoutId);
          const contentType = res.headers.get("content-type");
          console.log(
            "[Langchain] request response content type: ",
            contentType,
          );

          if (contentType?.startsWith("text/plain")) {
            responseText = await res.clone().text();
            return finish();
          }

          if (
            !res.ok ||
            !res.headers
              .get("content-type")
              ?.startsWith(EventStreamContentType) ||
            res.status !== 200
          ) {
            console.log("[Langchain] onopen: not-ok: ", responseText);
            const responseTexts = [responseText];
            let extraInfo = await res.clone().text();
            try {
              const resJson = await res.clone().json();
              extraInfo = prettyObject(resJson);
            } catch {}

            if (res.status === 401) {
              responseTexts.push(Locale.Error.Unauthorized);
            }

            if (extraInfo) {
              responseTexts.push(extraInfo);
            }

            responseText = responseTexts.join("\n\n");

            return finish();
          }
        },
        onmessage(msg) {
          // console.log("[Langchain] onmessage: ", msg.data);
          if (msg.data === "" || finished) {
            return finish();
          }
          const text = msg.data;
          try {
            const json = JSON.parse(text);
            // console.log("[Langchain] ops: ", json.ops);

            const isOutputStream = json.ops.some((op: any) =>
              op.path.includes("/streamed_output_str/-"),
            );
            // console.log("[Langchain] isOutputStream: ", isOutputStream);

            if (!isOutputStream) return;

            const delta = json.ops[0].value;

            if (delta) {
              remainText += delta;
              console.log("[Langchain] remainText: ", remainText);
            }
          } catch (e) {
            console.error("[Request] parse error", text, msg);
          }
        },
        onclose() {
          finish();
        },
        onerror(e) {
          options.onError?.(e);
          throw e;
        },
        openWhenHidden: true,
      });
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }

  usage(): Promise<LLMUsage> {
    throw new Error("Method not implemented.");
  }

  models(): Promise<LLMModel[]> {
    throw new Error("Method not implemented.");
  }
}
