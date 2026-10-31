import ReactECharts from "echarts-for-react";

type Props = {
  data: {
    date: string;
    close: number;
  }[];
};

export default function StockChart({ data }: Props) {
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.date),
      axisLine: { lineStyle: { color: "#aaa" } },
    },
    yAxis: {
      type: "value",
      axisLine: { lineStyle: { color: "#aaa" } },
      splitLine: { lineStyle: { color: "#333" } },
    },
    series: [
      {
        name: "Price",
        type: "line",
        smooth: true,
        data: data.map((d) => d.close),
        lineStyle: {
          color: "#4cafef",
          width: 2,
        },
        areaStyle: {
          color: "rgba(76, 175, 239, 0.2)",
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 400 }} />;
}